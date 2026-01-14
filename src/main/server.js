// server.js
if (Number(process.version.slice(1).split(".")[0]) < 18) {
    throw new Error("Invalid Node.js version: " + process.version);
}

// Required steps to create a servient for creating a thing
const Servient = require('@node-wot/core').Servient;
const HttpServer = require('@node-wot/binding-http').HttpServer;

const glob = require('glob');

const servient = new Servient();
servient.addServer(new HttpServer({
    port: 80,
    baseUri: "http://84.88.76.18/wot",
    updateInteractionNameWithUriVariablePattern: false
}));

const fs = require('fs');
const csv = require('csv-parser');
const {formatNumber} = require("chart.js/helpers");
const path = require('path');
const XLSX = require('xlsx');

function readJsonFileSync(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

console.log("Reading arguments...")
const args = process.argv.slice(2);
if (args.length === 0) {
    throw new Error("Configuration file missing")
}
console.log("Configuration filename:", args[0]);
let config = readJsonFileSync(args[0]);
const urlhost = config['urlhost'];
const config_baseurl = config['baseurl'];
const froststring = "/FROST-Server/v1.1"
const baseurl = urlhost + froststring
console.log("Database url:", baseurl)

const csvFilePath = "src/main/sensorChecklist.csv";

// Queue to manage write operations
const writeQueue = [];

// Flag to indicate if a write operation is currently in progress
let isWriting = false;

// Function to process the queue
function processQueue() {
    if (writeQueue.length === 0 || isWriting) {
        return;
    }

    const {key, value, resolve, reject} = writeQueue.shift();
    isWriting = true;

    fs.promises.readFile(csvFilePath, 'utf-8')
        .then((fileContent) => {
            let updated = false;
            const rows = fileContent.trim().split('\n').map(row => row.split(','));

            for (let i = 0; i < rows.length; i++) {
                if (rows[i][0] === key) {
                    rows[i][1] = value; // Update the second value
                    updated = true;
                    break;
                }
            }

            if (!updated) {
                rows.push([key, value]); // Add new row if key not found
            }

            const newContent = rows.map(row => row.join(',')).join('\n');
            return fs.promises.writeFile(csvFilePath, newContent);
        })
        .then(() => {
            resolve();
        })
        .catch((err) => {
            reject(err);
        })
        .finally(() => {
            isWriting = false;
            processQueue();
        });
}

// Function to write data to CSV
function writeToCSV(key, value) {
    return new Promise((resolve, reject) => {
        writeQueue.push({key, value, resolve, reject});
        processQueue();
    });
}


function formatDate(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

function formatUrl(database_url) {
    let url = database_url;
    if (!database_url.startsWith(baseurl)) {
        let index = database_url.indexOf(froststring);
        if (index !== -1) {
            url = urlhost + database_url.slice(index);
        }
    }
    return url;
}

function fetchFromDatabase(database_url) {
    return fetch(formatUrl(database_url)).then(function (response) {
        if (response.ok) {
            return response.json();
        }
        throw new Error('Request failed');
    }).then(function (data) {
        return data;
    }).catch(function (error) {
        console.log(error);
    });
}

async function fetchAllPagesFromDatabase(database_url) {
    return fetch(formatUrl(database_url)).then(async function (response) {
        if (response.ok) {
            let body = await response.json();
            if ("value" in body && "@iot.nextLink" in body && body["@iot.nextLink"] !== null) {
                let nextLink = body["@iot.nextLink"];
                while (nextLink !== null) {

                    nextLink = nextLink.replace("http://localhost:8008/FROST-Server/v1.1", baseurl);
                    let nextBody = await fetch(nextLink).then(function (response) {
                        if (response.ok) {
                            return response.json();
                        }
                        return {}
                    });
                    body["value"].push(...nextBody["value"]);
                    if ("@iot.nextLink" in nextBody) {
                        nextLink = nextBody["@iot.nextLink"];
                    } else {
                        nextLink = null;
                    }

                }
            }
            return body;

        }
        throw new Error('Request failed');
    }).then(function (data) {
        return data;
    }).catch(function (error) {
        console.log(error);
    });
}

function postToDatabase(database_url, data) {
    let requestBody = JSON.stringify(data);
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: requestBody
    };
    return fetch(formatUrl(database_url), options).then(function (response) {
        if (response.ok) {
            return true;
        } else {
            // Print the error code and message from the response
            response.text().then(text => {
                try {
                    const errorJson = JSON.parse(text);
                    console.log("Failed to post to database ", database_url, " data: ", data);
                    if (errorJson && errorJson.error) {
                        console.log("Error code:", errorJson.error.code);
                        console.log("Error message:", errorJson.error.message);
                    } else {
                        console.log("Error response:", errorJson);
                    }
                } catch (e) {
                    console.log("Error response (not JSON):", text);
                }
                throw new Error('Request failed');
            });
        }


    }).then(function (data) {
        return data;
    }).catch(function (error) {
        console.log(error);
    });
}

function getOneMonthBefore(dateString) {
    // Parse the input date string into a Date object
    const date = new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
    }

    // Subtract 6 months from the date
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() - 1);

    // Adjust the day if necessary (e.g., if the resulting month has fewer days)
    if (newDate.getDate() !== date.getDate()) {
        newDate.setDate(0); // This sets the date to the last day of the previous month
    }

    // Format the new date back to the original format
    const year = newDate.getUTCFullYear();
    const month = String(newDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(newDate.getUTCDate()).padStart(2, '0');
    const hours = String(newDate.getUTCHours()).padStart(2, '0');
    const minutes = String(newDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(newDate.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

function getOneWeekBefore(dateString) {
    // Parse the input date string into a Date object
    const date = new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
    }

    // Subtract 6 months from the date
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - 7);

    // Adjust the day if necessary (e.g., if the resulting month has fewer days)
    if (newDate.getDate() !== date.getDate()) {
        newDate.setDate(0); // This sets the date to the last day of the previous month
    }

    // Format the new date back to the original format
    const year = newDate.getUTCFullYear();
    const month = String(newDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(newDate.getUTCDate()).padStart(2, '0');
    const hours = String(newDate.getUTCHours()).padStart(2, '0');
    const minutes = String(newDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(newDate.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

function getSixMonthsBefore(dateString) {
    // Parse the input date string into a Date object
    const date = new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
    }

    // Subtract 6 months from the date
    const newDate = new Date(date);
    // -1 to go from 1-index to 0-index, -6 to go 6 months before
    newDate.setMonth((newDate.getMonth() - 1 - 6) % 12);

    // Adjust the day if necessary (e.g., if the resulting month has fewer days)
    if (newDate.getDate() !== date.getDate()) {
        newDate.setDate(0); // This sets the date to the last day of the previous month
    }

    // Format the new date back to the original format
    const year = newDate.getUTCFullYear();
    const month = String(newDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(newDate.getUTCDate()).padStart(2, '0');
    const hours = String(newDate.getUTCHours()).padStart(2, '0');
    const minutes = String(newDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(newDate.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

async function setThingLocation(thingId, latitude, longitude) {
    location_body = {
        "name": "Default",
        "description": "This is the default location",
        "properties": {},
        "encodingType": "application/geo+json",
        "location": {
            "type": "Point",
            "coordinates": [latitude, longitude]
        },
        "Things": [
            {"@iot.id": thingId}
        ]
    }
    postToDatabase(baseurl + "/Locations", location_body).then((data) => {
        return data;
    });
}

async function fetchFieldInformation(fieldName) {
    var locationsUrl;
    var result = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        var field = data["value"][0];
        locationsUrl = field["Locations@iot.navigationLink"];
        return {
            "name": field["name"],
            "description": field["description"],
            "pilot": field["properties"]["pilot"],
            "location": {}
        }
    });
    result["location"] = await fetchFromDatabase(locationsUrl).then((data) => {
        var location = data["value"][0];
        return location["location"];
    })
    return result;
}

async function fetchBasinInformation(itemName) {
    try {
        // Get date range (last 12 months only)
        let oneYearAgo = new Date();
        oneYearAgo.setHours(0, 0, 0, 0);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        let now = new Date();
        now.setUTCDate(1);
        now.setUTCHours(0, 0, 0, 0);

        // Create the correct datastream name format (remove spaces for platform compatibility)
        const datastreamPrefix = itemName.replaceAll(" ", "");

        // Fetch basin measurements using platform's 9 datastreams
        // Inflow data
        let minInflow_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMinInflow", formatDate(now), "", 1000, 0);
        let maxInflow_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMaxInflow", formatDate(now), "", 1000, 0);
        let meanInflow_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMeanInflow", formatDate(now), "", 1000, 0);

        // Outflow/Demand data
        let minOutflow_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMinIrrigationDemand", formatDate(now), "", 1000, 0);
        let maxOutflow_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMaxIrrigationDemand", formatDate(now), "", 1000, 0);
        let meanOutflow_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMeanIrrigationDemand", formatDate(now), "", 1000, 0);

        // Storage/Volume data
        let minStorage_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMinProjectedVolume", formatDate(now), "", 1000, 0);
        let maxStorage_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMaxProjectedVolume", formatDate(now), "", 1000, 0);
        let meanStorage_observations = await fetchAllObservationsInDatastreamInRange(itemName, datastreamPrefix + "_MonthlyMeanProjectedVolume", formatDate(now), "", 1000, 0);

        // Fetch ENAS weekly storage data for September (lowest month)
        // Note: The datastream AVG_WEEKLY_ENAS_10329_Water_Storage_m3 is inside the Cantoniera Reservoir item
        console.log(`[DEBUG] Fetching ENAS datastream from itemName: ${itemName}`);
        console.log(`[DEBUG] Looking for datastream: AVG_WEEKLY_ENAS_10329_Water_Storage_m3`);

        let enasWeeklyStorage_observations;
        try {
            enasWeeklyStorage_observations = await fetchAllObservationsInDatastreamInRange(itemName, "AVG_WEEKLY_ENAS_10329_Water_Storage_m3", formatDate(now), "", 1000, 0);
            console.log(`[DEBUG] ENAS fetch result:`, enasWeeklyStorage_observations);
        } catch (error) {
            console.log(`[ERROR] Failed to fetch ENAS data:`, error.message);
            enasWeeklyStorage_observations = undefined;
        }

        // If no ENAS data for current period, try to get latest available data from past months
        if (!enasWeeklyStorage_observations || enasWeeklyStorage_observations.length === 0) {
            console.log(`[DEBUG] No ENAS data found for current period, trying to fetch latest available data...`);

            try {
                // Try to get data from the last 6 months to find the most recent available data
                let sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

                enasWeeklyStorage_observations = await fetchAllObservationsInDatastreamInRange(
                    itemName,
                    "AVG_WEEKLY_ENAS_10329_Water_Storage_m3",
                    formatDate(sixMonthsAgo),
                    formatDate(now),
                    1000,
                    0
                );
                console.log(`[DEBUG] ENAS fetch result for last 6 months:`, enasWeeklyStorage_observations);
            } catch (error) {
                console.log(`[ERROR] Failed to fetch ENAS data for last 6 months:`, error.message);
                enasWeeklyStorage_observations = undefined;
            }

            // If still no data, try to get ANY available data from the last 2 years
            if (!enasWeeklyStorage_observations || enasWeeklyStorage_observations.length === 0) {
                console.log(`[DEBUG] Still no ENAS data found in last 6 months, trying to fetch ANY available data from last 2 years...`);

                try {
                    let twoYearsAgo = new Date();
                    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

                    enasWeeklyStorage_observations = await fetchAllObservationsInDatastreamInRange(
                        itemName,
                        "AVG_WEEKLY_ENAS_10329_Water_Storage_m3",
                        formatDate(twoYearsAgo),
                        formatDate(now),
                        1000,
                        0
                    );
                    console.log(`[DEBUG] ENAS fetch result for last 2 years:`, enasWeeklyStorage_observations);
                } catch (error) {
                    console.log(`[ERROR] Failed to fetch ENAS data for last 2 years:`, error.message);
                    enasWeeklyStorage_observations = undefined;
                }
            }
        }

        if (minInflow_observations === undefined || maxInflow_observations === undefined || meanInflow_observations === undefined || minOutflow_observations === undefined || maxOutflow_observations === undefined || meanOutflow_observations === undefined || minStorage_observations === undefined || maxStorage_observations === undefined || meanStorage_observations === undefined) {
            return {
                "result": false,
                "data": [],
                "error": "No observations found"
            };
        }
        // Process data by month
        let basin_data = [];

        function getMonthKey(timestamp) {
            const date = new Date(timestamp);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-02T08:02:26.380Z`;
        }

        // Proper aggregation logic using Map to avoid duplication
        const aggregatedData = new Map();

        function addToAggregatedData(observations, measure_type, unit, value_type, valueKey) {
            if (!Array.isArray(observations) || observations.length === 0) {
                return;
            }

            observations.forEach(obs => {
                const monthKey = getMonthKey(obs.time_of_measure);
                const key = `${monthKey}_${measure_type}`;

                if (!aggregatedData.has(key)) {
                    aggregatedData.set(key, {
                        "datetime": monthKey,
                        "measure": measure_type,
                        "unit": unit,
                        "value_type": value_type,
                        "min": "",
                        "max": "",
                        "mean": ""
                    });
                }

                const record = aggregatedData.get(key);
                record[valueKey] = obs.value.toString();
            });
        }

        // Add min, max, and mean values to aggregated data
        addToAggregatedData(minInflow_observations, "inflow", "M3/S", "forecast", "min");
        addToAggregatedData(maxInflow_observations, "inflow", "M3/S", "forecast", "max");
        addToAggregatedData(meanInflow_observations, "inflow", "M3/S", "forecast", "mean");

        addToAggregatedData(minOutflow_observations, "outflow", "M3/S", "forecast", "min");
        addToAggregatedData(maxOutflow_observations, "outflow", "M3/S", "forecast", "max");
        addToAggregatedData(meanOutflow_observations, "outflow", "M3/S", "forecast", "mean");

        // Debug: Show what storage data is available
        console.log(`[DEBUG] Min storage observations:`, minStorage_observations);
        console.log(`[DEBUG] Max storage observations:`, maxStorage_observations);
        console.log(`[DEBUG] Mean storage observations:`, meanStorage_observations);

        if (minStorage_observations && minStorage_observations.length > 0) {
            console.log(`[DEBUG] Min storage data dates:`, minStorage_observations.map(obs => obs.time_of_measure));
        }
        if (maxStorage_observations && maxStorage_observations.length > 0) {
            console.log(`[DEBUG] Max storage data dates:`, maxStorage_observations.map(obs => obs.time_of_measure));
        }
        if (meanStorage_observations && meanStorage_observations.length > 0) {
            console.log(`[DEBUG] Mean storage data dates:`, meanStorage_observations.map(obs => obs.time_of_measure));
        }

        addToAggregatedData(minStorage_observations, "storage", "1000 M3", "forecast", "min");
        addToAggregatedData(maxStorage_observations, "storage", "1000 M3", "forecast", "max");
        addToAggregatedData(meanStorage_observations, "storage", "1000 M3", "forecast", "mean");

        // Special handling for September storage data only: replace min, max, mean with latest ENAS sensor value
        // Note: September might not appear in the endpoint response, but we update it if it exists
        console.log(`[DEBUG] ENAS weekly storage observations:`, enasWeeklyStorage_observations);
        console.log(`[DEBUG] ENAS data length:`, enasWeeklyStorage_observations ? enasWeeklyStorage_observations.length : 'undefined');

        // Variables for September update (declared outside if block for verification access)
        let latestENASValue = null;
        let latestENASDate = null;
        let septemberYear = new Date().getFullYear();

        if (enasWeeklyStorage_observations && Array.isArray(enasWeeklyStorage_observations) && enasWeeklyStorage_observations.length > 0) {
            // Find the most recent value from ENAS weekly storage data (latest available sensor reading)
            // Sort by date to get the most recent observation
            enasWeeklyStorage_observations.sort((a, b) => new Date(b.time_of_measure) - new Date(a.time_of_measure));
            latestENASValue = enasWeeklyStorage_observations[0].value;
            latestENASDate = enasWeeklyStorage_observations[0].time_of_measure;

            console.log(`[DEBUG] Latest ENAS sensor value:`, latestENASValue);
            console.log(`[DEBUG] Latest ENAS sensor date:`, latestENASDate);

            // Update September storage data only (hardcoded to September)
            // Determine the correct year - use the year from the first storage observation if available
            if (minStorage_observations && minStorage_observations.length > 0) {
                const firstStorageDate = new Date(minStorage_observations[0].time_of_measure);
                septemberYear = firstStorageDate.getFullYear();
                // If first storage is October or later, September should be the same year
                if (firstStorageDate.getMonth() >= 9) { // Month 9 is October (0-indexed)
                    septemberYear = firstStorageDate.getFullYear();
                } else {
                    // If first storage is before October, September is the previous year
                    septemberYear = firstStorageDate.getFullYear();
                }
            }

            const septemberKey = `${septemberYear}-09-02T08:02:26.380Z`;
            const septemberStorageKey = `${septemberKey}_storage`;
            console.log(`[DEBUG] Looking for September key: ${septemberStorageKey} (year: ${septemberYear})`);
            console.log(`[DEBUG] Available keys:`, Array.from(aggregatedData.keys()));

            let septemberData;
            if (aggregatedData.has(septemberStorageKey)) {
                septemberData = aggregatedData.get(septemberStorageKey);

                // Show September data BEFORE update
                console.log(`[DEBUG] ========== SEPTEMBER DATA BEFORE UPDATE ==========`);
                console.log(`[DEBUG] September datetime: ${septemberData.datetime}`);
                console.log(`[DEBUG] September min (BEFORE): ${septemberData.min}`);
                console.log(`[DEBUG] September max (BEFORE): ${septemberData.max}`);
                console.log(`[DEBUG] September mean (BEFORE): ${septemberData.mean}`);
                console.log(`[DEBUG] ====================================================`);

                // Store original values for comparison
                const originalMin = septemberData.min;
                const originalMax = septemberData.max;
                const originalMean = septemberData.mean;

                // Update all three metrics (min, max, mean) to the same ENAS sensor value
                septemberData.min = latestENASValue.toString();
                septemberData.max = latestENASValue.toString();
                septemberData.mean = latestENASValue.toString();

            } else {
                // Create September if it doesn't exist (even though it won't be in response)
                console.log(`[DEBUG] September storage key not found - CREATING September entry internally`);
                septemberData = {
                    "datetime": septemberKey,
                    "measure": "storage",
                    "unit": "1000 M3",
                    "value_type": "forecast",
                    "min": latestENASValue.toString(),
                    "max": latestENASValue.toString(),
                    "mean": latestENASValue.toString()
                };
                aggregatedData.set(septemberStorageKey, septemberData);
                console.log(`[DEBUG] Created September entry internally (will not appear in response)`);
            }

            // Show September data AFTER update/creation
            console.log(`[DEBUG] ========== SEPTEMBER DATA (FINAL VALUES) ==========`);
            console.log(`[DEBUG] September datetime: ${septemberData.datetime}`);
            console.log(`[DEBUG] September min: ${septemberData.min}`);
            console.log(`[DEBUG] September max: ${septemberData.max}`);
            console.log(`[DEBUG] September mean: ${septemberData.mean}`);
            console.log(`[DEBUG] All three values (min, max, mean) set to latest ENAS sensor value: ${latestENASValue}`);
            console.log(`[DEBUG] ENAS sensor date: ${latestENASDate}`);
            console.log(`[DEBUG] Values match check: min==max==mean = ${septemberData.min === septemberData.max && septemberData.max === septemberData.mean}`);
            console.log(`[DEBUG] ====================================================`);
            console.log(`[DEBUG] Complete September data object:`, JSON.stringify(septemberData, null, 2));
        } else {
            console.log(`[DEBUG] ENAS weekly storage data is not available or empty - September will use original forecast data`);
        }

        // Debug: Confirm other months remain unchanged (not September)
        console.log(`[DEBUG] ========== VERIFICATION: OTHER MONTHS UNCHANGED ==========`);
        const allStorageKeys = Array.from(aggregatedData.keys()).filter(key => key.endsWith('_storage'));
        const nonSeptemberKeys = allStorageKeys.filter(key => !key.includes('09-02T08:02:26.380Z'));
        console.log(`[DEBUG] Total storage months: ${allStorageKeys.length}`);
        console.log(`[DEBUG] Non-September months (should remain unchanged): ${nonSeptemberKeys.length}`);

        // Specifically check October to ensure it wasn't accidentally modified
        if (latestENASValue !== null) {
            const octoberKey = `${septemberYear}-10-02T08:02:26.380Z_storage`;
            if (aggregatedData.has(octoberKey)) {
                const octoberData = aggregatedData.get(octoberKey);
                const enasValueStr = latestENASValue.toString();
                const isOctoberModified = (octoberData.min === enasValueStr && octoberData.max === enasValueStr && octoberData.mean === enasValueStr);
                console.log(`[DEBUG] October verification:`);
                console.log(`[DEBUG]   October min: ${octoberData.min}`);
                console.log(`[DEBUG]   October max: ${octoberData.max}`);
                console.log(`[DEBUG]   October mean: ${octoberData.mean}`);
                console.log(`[DEBUG]   ENAS value: ${enasValueStr}`);
                console.log(`[DEBUG]   October modified (should be false): ${isOctoberModified}`);
                if (isOctoberModified) {
                    console.log(`[ERROR] WARNING: October appears to have been modified! This should not happen.`);
                } else {
                    console.log(`[DEBUG]   ✓ October correctly preserved with original forecast values`);
                }
            }
        }

        if (nonSeptemberKeys.length > 0) {
            console.log(`[DEBUG] Sample of other months (first 3):`);
            nonSeptemberKeys.slice(0, 3).forEach(key => {
                const monthData = aggregatedData.get(key);
                console.log(`[DEBUG]   ${key}: min=${monthData.min}, max=${monthData.max}, mean=${monthData.mean} (original forecast values preserved)`);
            });
        }
        console.log(`[DEBUG] ====================================================`);

        // Debug: Show what months are available in aggregated data
        console.log(`[DEBUG] All available keys in aggregated data:`, Array.from(aggregatedData.keys()));
        console.log(`[DEBUG] Number of data points:`, aggregatedData.size);

        // Convert Map values to array
        basin_data = Array.from(aggregatedData.values());

        // Debug: Show what data we have before organization
        console.log(`[DEBUG] Basin data before organization:`, basin_data);

        // Reorganize data: group by measurement type, then by datetime
        const organizedData = [];
        const measurementTypes = ["inflow", "outflow", "storage"];

        measurementTypes.forEach(measureType => {
            // Get all data for this measurement type
            const measureData = basin_data.filter(item => item.measure === measureType);
            console.log(`[DEBUG] ${measureType} data:`, measureData);

            // Sort by datetime (oldest to newest)
            measureData.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

            // Add to organized data
            organizedData.push(...measureData);
        });

        console.log(`[DEBUG] Final organized data:`, organizedData);
        console.log(`[DEBUG] Total data points in response:`, organizedData.length);

        return {
            "data": organizedData
        };
    } catch (error) {
        console.log(`[ERROR] Error fetching basin data for ${itemName}:`, error.message);
        return {
            "data": [],
            "error": "No basin data available for this item"
        };
    }
}

async function fetchFieldIrrigationDates(fieldName) {
    var result = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        var field = data["value"][0];
        return {
            "earlyIrrigationDate": field["properties"]["earlyIrrigationDate"],
            "lateIrrigationDate": field["properties"]["lateIrrigationDate"],
            "limitIrrigationDate": field["properties"]["limitIrrigationDate"],
        }
    });
    return result;
}

async function fetchHistoricalData(itemName) {

    try {
        // Determine the type based on itemName
        let itemType = 'volume';
        if (itemName.toLowerCase().includes('inflow')) {
            itemType = 'inflow';
        } else if (itemName.toLowerCase().includes('outflow')) {
            itemType = 'outflow';
        } else if (itemName.toLowerCase().includes('volume')) {
            itemType = 'volume';
        }

        // Define the Excel files and their configurations
        const excelFiles = [
            {
                path: 'src/resources/historicalData/historic_measures_volume.xlsx',
                type: 'volume',
                // sheets: ['max_min_average'] // Only process max_min_average sheet for volume
                sheetIndex: 1 // Use second sheet (index 1) for volume file
            },
            {
                path: 'src/resources/historicalData/historic_measures_outflow.xlsx',
                type: 'outflow',
                sheets: ['max_min_average_mcs'] // Only process max_min_average_mcs sheet for outflow
            },
            {
                path: 'src/resources/historicalData/historic_measures_inflow.xlsx',
                type: 'inflow',
                sheets: ['max_min_average_mcs'] // Only process max_min_average_mcs sheet for inflow
            }
        ];

        // get statistics for volume, inflow, and outflow
        const relevantFiles = excelFiles;

        // Use Map to group data by month and measure type
        const monthlyData = new Map();

        // Process each relevant Excel file
        for (const fileConfig of relevantFiles) {
            try {
                if (!fs.existsSync(fileConfig.path)) {
                    continue;
                }

                const workbook = XLSX.readFile(fileConfig.path);

                // Process the configured sheet for this file
                let sheetName;
                if (fileConfig.sheetIndex !== undefined) {
                    // Use sheet index (for volume - second sheet)
                    if (fileConfig.sheetIndex >= workbook.SheetNames.length) {
                        console.log(`[DEBUG] Sheet index ${fileConfig.sheetIndex} not available. Available sheets:`, workbook.SheetNames);
                        continue;
                    }
                    sheetName = workbook.SheetNames[fileConfig.sheetIndex];
                    console.log(`[DEBUG] Using sheet index ${fileConfig.sheetIndex} (${sheetName}) for ${fileConfig.type}`);
                } else if (fileConfig.sheets && fileConfig.sheets.length > 0) {
                    // Use sheet name (for outflow/inflow)
                    sheetName = fileConfig.sheets[0];
                    if (!workbook.SheetNames.includes(sheetName)) {
                        console.log(`[DEBUG] Sheet ${sheetName} not found. Available sheets:`, workbook.SheetNames);
                        continue;
                    }
                } else {
                    console.log(`[DEBUG] No sheet configuration found for ${fileConfig.type}`);
                    continue;
                }

                console.log(`[DEBUG] Processing sheet "${sheetName}" from ${fileConfig.path}`);
                const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

                // Check if this sheet has the expected month column format (either 'month-year' or 'Month')
                const firstRow = sheet[0];
                const monthColumnName = firstRow && (firstRow['month-year'] || firstRow['Month']) ?
                    (firstRow['month-year'] ? 'month-year' : 'Month') : null;

                if (!firstRow || !monthColumnName) {
                    continue;
                }

                // Process each row in the sheet
                sheet.forEach((row, index) => {
                    // Skip header rows (rows without month data)
                    if (!row || !row[monthColumnName]) {
                        return;
                    }

                    // Extract month-year from the month column
                    const monthYear = row[monthColumnName];
                    if (!monthYear) return;


                    // Determine unit based on file type and sheet name
                    let determinedUnit = '';

                    // Try different possible column name patterns based on Excel structure
                    let maxValue, minValue, avgValue;

                    const typeCapitalized = fileConfig.type.charAt(0).toUpperCase() + fileConfig.type.slice(1);

                    // Define all possible patterns
                    const patterns = [
                        // Volume patterns
                        {type: typeCapitalized, unit: 'Mmc', format: `[Mmc]`},
                        {type: typeCapitalized, unit: 'Mmc', format: `(Mmc)`},
                        // Outflow patterns (m3/s)
                        {type: typeCapitalized, unit: 'm3/s', format: `[m3/s]`},
                        // Inflow patterns (mc/s)
                        {type: typeCapitalized, unit: 'mc/s', format: `[mc/s]`}
                    ];

                    // Iterate through patterns to find a match
                    for (const pattern of patterns) {
                        const maxCandidateKey = `Max of ${pattern.type} ${pattern.format}`;
                        const minCandidateKey = `Min of ${pattern.type} ${pattern.format}`;
                        const avgCandidateKey = `Average of ${pattern.type} ${pattern.format}`;

                        if (row[maxCandidateKey] !== undefined && row[minCandidateKey] !== undefined && row[avgCandidateKey] !== undefined) {
                            maxValue = row[maxCandidateKey];
                            minValue = row[minCandidateKey];
                            avgValue = row[avgCandidateKey];
                            determinedUnit = pattern.unit;
                            break; // Found a match, exit loop
                        }
                    }

                    // If no values found with specific patterns, try fallback for volume data
                    if (!maxValue && !minValue && !avgValue) {
                        const allKeys = Object.keys(row);
                        const matchingKeys = allKeys.filter(key => key.toLowerCase().includes(fileConfig.type.toLowerCase()));

                        // Try to find max/min/avg in these columns
                        matchingKeys.forEach(key => {
                            if (key.toLowerCase().includes('max') && !maxValue) {
                                maxValue = row[key];
                                // Attempt to extract unit from the matched key
                                const unitMatch = key.match(/\[(.*?)\]|\((.*?)\)/);
                                if (unitMatch && (unitMatch[1] || unitMatch[2])) {
                                    determinedUnit = unitMatch[1] || unitMatch[2];
                                }
                            }
                            if (key.toLowerCase().includes('min') && !minValue) {
                                minValue = row[key];
                                const unitMatch = key.match(/\[(.*?)\]|\((.*?)\)/);
                                if (unitMatch && (unitMatch[1] || unitMatch[2]) && !determinedUnit) {
                                    determinedUnit = unitMatch[1] || unitMatch[2];
                                }
                            }
                            if ((key.toLowerCase().includes('average') || key.toLowerCase().includes('avg')) && !avgValue) {
                                avgValue = row[key];
                                const unitMatch = key.match(/\[(.*?)\]|\((.*?)\)/);
                                if (unitMatch && (unitMatch[1] || unitMatch[2]) && !determinedUnit) {
                                    determinedUnit = unitMatch[1] || unitMatch[2];
                                }
                            }
                        });
                    }

                    // If unit is still not determined, use a default based on file type
                    if (!determinedUnit) {
                        if (fileConfig.type === 'volume') {
                            determinedUnit = 'Mmc';
                        } else if (fileConfig.type === 'outflow') {
                            determinedUnit = 'm3/s';
                        } else if (fileConfig.type === 'inflow') {
                            determinedUnit = 'mc/s';
                        }
                    }

                    // Convert month-year to datetime (handling Excel serial numbers)
                    let datetime;
                    let monthKey;
                    try {
                        // Check if monthYear is a number (Excel serial date)
                        if (typeof monthYear === 'number') {
                            // Convert Excel serial number to JavaScript Date
                            // Excel dates are days since 1900-01-01, but Excel incorrectly treats 1900 as leap year
                            const excelEpoch = new Date(1900, 0, 1);
                            const date = new Date(excelEpoch.getTime() + (monthYear - 2) * 24 * 60 * 60 * 1000);
                            datetime = date.toISOString();
                            // For outflow/inflow, create month key (year not relevant)
                            monthKey = `${date.getMonth() + 1}`; // 1-12
                        } else {
                            // Handle string format like "Jan-2023"
                            const [month, year] = monthYear.split('-');
                            const monthMap = {
                                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                                'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                            };
                            const monthIndex = monthMap[month];
                            datetime = new Date(parseInt(year), monthIndex, 1).toISOString();
                            // For outflow/inflow, create month key (year not relevant)
                            monthKey = `${monthIndex + 1}`; // 1-12
                        }
                    } catch (e) {
                        return; // Skip this row if date parsing fails
                    }

                    // Group by month and collect all values for statistics
                    const monthDataKey = `${monthKey}_${fileConfig.type}_${determinedUnit}`;

                    if (!monthlyData.has(monthDataKey)) {
                        monthlyData.set(monthDataKey, {
                            month: monthKey,
                            measure: fileConfig.type,
                            unit: determinedUnit,
                            values: []
                        });
                    }

                    const monthRecord = monthlyData.get(monthDataKey);

                    // Helper function to validate and parse values - filters out 0, empty cells, and NaN
                    const isValidValue = (value, valueType, monthYear) => {
                        // Check for undefined, null, or empty string
                        if (value === undefined || value === null || value === '') {
                            console.log(`[DEBUG] Skipping ${valueType} value for ${monthYear}: empty cell (${value})`);
                            return null;
                        }

                        // Check if it's already NaN before parsing
                        if (typeof value === 'number' && isNaN(value)) {
                            console.log(`[DEBUG] Skipping ${valueType} value for ${monthYear}: NaN`);
                            return null;
                        }

                        // Parse the value
                        const parsedValue = parseFloat(value);

                        // Check if parsing resulted in NaN
                        if (isNaN(parsedValue)) {
                            console.log(`[DEBUG] Skipping ${valueType} value for ${monthYear}: parsed as NaN (${value})`);
                            return null;
                        }

                        // Check if value is exactly 0 (likely empty cell artifact)
                        if (parsedValue === 0) {
                            console.log(`[DEBUG] Skipping ${valueType} value for ${monthYear}: exactly 0 (likely empty cell)`);
                            return null;
                        }

                        // Also check for Infinity values (shouldn't happen but good to filter)
                        if (!isFinite(parsedValue)) {
                            console.log(`[DEBUG] Skipping ${valueType} value for ${monthYear}: Infinity (${value})`);
                            return null;
                        }

                        // Valid value
                        return parsedValue;
                    };

                    // Process max value
                    const validMax = isValidValue(maxValue, 'max', monthYear);
                    if (validMax !== null) {
                        monthRecord.values.push({type: 'max', value: validMax});
                    }

                    // Process min value
                    const validMin = isValidValue(minValue, 'min', monthYear);
                    if (validMin !== null) {
                        monthRecord.values.push({type: 'min', value: validMin});
                    }

                    // Process avg value
                    const validAvg = isValidValue(avgValue, 'avg', monthYear);
                    if (validAvg !== null) {
                        monthRecord.values.push({type: 'avg', value: validAvg});
                    }

                });

            } catch (fileError) {
                // Continue with other files
            }
        }

        // Process monthly data for all file types
        const monthlyResults = [];
        for (const [key, monthRecord] of monthlyData) {
            // Skip months with no data
            if (monthRecord.values.length === 0) {
                continue;
            }

            // Calculate statistics for this month
            const maxValues = monthRecord.values.filter(v => v.type === 'max').map(v => v.value);
            const minValues = monthRecord.values.filter(v => v.type === 'min').map(v => v.value);
            const avgValues = monthRecord.values.filter(v => v.type === 'avg').map(v => v.value);

            // Debug: Show what values are being used for calculation
            console.log(`[DEBUG] Month: ${monthRecord.month}, Measure: ${monthRecord.measure}`);
            console.log(`[DEBUG]   Max values count: ${maxValues.length}, Values: [${maxValues.slice(0, 5).join(', ')}${maxValues.length > 5 ? '...' : ''}]`);
            console.log(`[DEBUG]   Min values count: ${minValues.length}, Values: [${minValues.slice(0, 5).join(', ')}${minValues.length > 5 ? '...' : ''}]`);
            console.log(`[DEBUG]   Avg values count: ${avgValues.length}, Values: [${avgValues.slice(0, 5).join(', ')}${avgValues.length > 5 ? '...' : ''}]`);

            // Calculate overall statistics
            const absMax = maxValues.length > 0 ? Math.max(...maxValues) : null;
            const absMin = minValues.length > 0 ? Math.min(...minValues) : null;
            const overallMean = avgValues.length > 0 ? avgValues.reduce((sum, val) => sum + val, 0) / avgValues.length : null;

            console.log(`[DEBUG]   Calculated abs_min: ${absMin} (minimum of all min values)`);
            console.log(`[DEBUG]   Calculated abs_max: ${absMax} (maximum of all max values)`);
            console.log(`[DEBUG]   Calculated mean: ${overallMean}`);

            // OPTION 2: Average approach - Average of all min/max values
            const avgOfMaxValues = maxValues.length > 0 ? maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length : null;
            const avgOfMinValues = minValues.length > 0 ? minValues.reduce((sum, val) => sum + val, 0) / minValues.length : null;

            // Create month name for datetime field
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const monthName = monthNames[parseInt(monthRecord.month) - 1];

            monthlyResults.push({
                datetime: monthName,
                measure: monthRecord.measure,
                unit: monthRecord.unit,
                // OPTION 1: Current approach (Math.min/Math.max)
                abs_min: absMin !== null ? absMin.toString() : null,
                abs_max: absMax !== null ? absMax.toString() : null,
                mean: overallMean !== null ? overallMean.toString() : null,
                // OPTION 2: Average approach
                min_avg: avgOfMinValues !== null ? avgOfMinValues.toString() : null,
                max_avg: avgOfMaxValues !== null ? avgOfMaxValues.toString() : null
            });
        }

        // Sort monthly results by month number (1-12)
        monthlyResults.sort((a, b) => {
            const monthOrder = {
                'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
                'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
            };
            return monthOrder[a.datetime] - monthOrder[b.datetime];
        });

        return {
            "data": monthlyResults
        };
    } catch (error) {
        return {error: error.message};
    }
}

async function fetchUrbanDemand(itemName) {
    try {
        // Get dynamic date range: 5 months ago + actual month + 5 months ahead
        let now = new Date();

        // Calculate 5 months ago
        let fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        fiveMonthsAgo.setHours(0, 0, 0, 0);

        // Calculate 5 months ahead
        let fiveMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 5, 1);
        fiveMonthsAhead.setHours(23, 59, 59, 999);

        // Fetch the datastream to get original units
        let datastream = await fetchDatastream(itemName, "CantonieraReservoir_MonthlyUrbanDemand");
        if (datastream === undefined) {
            console.log(`[ERROR] Datastream CantonieraReservoir_MonthlyUrbanDemand not found for ${itemName}`);
            return {
                "data": [{
                    "message": "No urbanDemand data found"
                }]
            };
        }

        // Get original units from datastream and convert to monthly units
        let originalUnits = datastream.unitOfMeasurement.name + "(" + datastream.unitOfMeasurement.symbol + ")";

        // Since we're summing daily m³ values to get monthly totals, always show as m³/month
        let monthlyUnits = originalUnits;
        if (originalUnits.toLowerCase().includes("m³") || originalUnits.toLowerCase().includes("m3")) {
            monthlyUnits = originalUnits.replace(/m³|m3/gi, "m³/month");
        } else {
            // If units don't contain m³, append /month to indicate monthly aggregation
            monthlyUnits = originalUnits + "/month";
        }

        // Fetch data from the CantonieraReservoir_MonthlyUrbanDemand datastream
        let urbanDemandObservations = await fetchAllObservationsInDatastreamInRange(
            itemName,
            "CantonieraReservoir_MonthlyUrbanDemand",
            formatDate(fiveMonthsAgo),
            formatDate(fiveMonthsAhead),
            1000,
            0
        );

        // Process data by month - use the monthly values directly
        const monthlyData = new Map();

        function getMonthKey(timestamp) {
            const date = new Date(timestamp);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-02T08:02:26.380Z`;
        }

        if (Array.isArray(urbanDemandObservations) && urbanDemandObservations.length > 0) {
            urbanDemandObservations.forEach((obs) => {
                const monthKey = getMonthKey(obs.time_of_measure);
                const value = parseFloat(obs.value);

                // Sum daily values to get monthly total
                if (monthlyData.has(monthKey)) {
                    monthlyData.get(monthKey).value += value;
                } else {
                    monthlyData.set(monthKey, {
                        "datetime": monthKey,
                        "value": value
                    });
                }
            });
        }

        // Generate urban demand data from the fetched values
        const urbanDemandData = [];
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];


        // Process each month's data
        for (const [monthKey, monthRecord] of monthlyData) {
            const monthlyUrbanDemand = monthRecord.value;

            // Get month name for display
            const date = new Date(monthKey);
            const monthName = monthNames[date.getMonth()];
            // const year = date.getFullYear();
            // const datetime = `${monthName} ${year}`;

            urbanDemandData.push({
                "datetime": monthName,
                "measure": "Monthly Urban Demand",
                "unit": monthlyUnits,
                "value": monthlyUrbanDemand.toFixed(6)
            });
        }

        // If no data was found, return message inside data array
        if (urbanDemandData.length === 0) {
            console.log(`[WARNING] No urban demand data found for ${itemName} in datastream CantonieraReservoir_MonthlyUrbanDemand`);
            return {
                "data": [{
                    "message": "No urbanDemand data found"
                }]
            };
        }

        // Sort by month order
        urbanDemandData.sort((a, b) => {
            const monthOrder = {
                'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
                'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
            };
            return monthOrder[a.datetime] - monthOrder[b.datetime];
        });

        return {
            "data": urbanDemandData
        };
    } catch (error) {
        console.log(`[ERROR] Error fetching urban demand data for ${itemName}:`, error.message);
        throw error;
    }
}

async function fetchSensorsInAField(fieldName) {
    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        return data["value"][0]["Datastreams@iot.navigationLink"];
    });
    return await fetchFromDatabase(datastreamsLink).then(async (data) => {
        let sensors = [];
        let sensorNames = [];
        for (let i = 0; i < data["value"].length; i++) {
            let sensorLink = data["value"][i]["Sensor@iot.navigationLink"];
            let sensor = await fetchFromDatabase(sensorLink).then((sensorData) => {
                return sensorData;
            });
            if (!sensorNames.includes(sensor["name"])) {
                sensors.push(sensor);
                sensorNames.push(sensor["name"]);
            }
        }
        return sensors;
    });
}

async function fetchSensorInAField(fieldName, sensorName) {
    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        return data["value"][0]["Datastreams@iot.navigationLink"];
    });
    return await fetchFromDatabase(datastreamsLink).then(async (data) => {
        for (let i = 0; i < data["value"].length; i++) {
            let sensorLink = data["value"][i]["Sensor@iot.navigationLink"];
            let sensor = await fetchFromDatabase(sensorLink).then((sensorData) => {
                return sensorData;
            });
            if (sensor["name"] === sensorName) {
                return sensor;
            }
        }
    });
}

async function fetchPropertiesInAField(fieldName) {
    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        return data["value"][0]["Datastreams@iot.navigationLink"];
    });
    return await fetchFromDatabase(datastreamsLink).then(async (data) => {
        let properties = [];
        let propertyNames = [];
        for (let i = 0; i < data["value"].length; i++) {
            let propertyLink = data["value"][i]["ObservedProperty@iot.navigationLink"];
            let property = await fetchFromDatabase(propertyLink).then((sensorData) => {
                return sensorData;
            });
            if (!propertyNames.includes(property["name"])) {
                properties.push(property);
                propertyNames.push(property["name"]);
            }
        }
        return properties;
    });
}

async function fetchPropertyInAField(fieldName, propertyName) {
    let properties = await fetchPropertiesInAField(fieldName);
    for (let i = 0; i < properties.length; i++) {
        if (properties[i]["name"] === propertyName) {
            return properties[i];
        }
    }
}

async function fetchDeviceAndProperyFromDatastream(datastream) {
    return await fetchFromDatabase(datastream["@iot.selfLink"]).then(async (data) => {
        let device_id = await fetchFromDatabase(data["Sensor@iot.navigationLink"]).then((data) => {
            return data["name"];
        });
        let property_name = await fetchFromDatabase(data["ObservedProperty@iot.navigationLink"]).then((data) => {
            return data["name"];
        });
        return {
            sensor: device_id,
            property: property_name
        }
    });
}

async function fetchDatastreamsInAField(fieldName) {
    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        return data["value"][0]["Datastreams@iot.navigationLink"];
    });

    let totals = await fetchFromDatabase(datastreamsLink).then(async (data) => {
        return data["@iot.count"];
    });

    let all_datastreams = [];

    let pages = Math.floor(totals / 100);
    let elems_last_req = totals - 100 * pages;

    for (let i = 0; i < pages; i++) {
        let sk = 100 * i;
        let result = await fetchFromDatabase(datastreamsLink + "?$orderby=name desc&$skip=" + sk).then(async (data) => {
            let datastreams = [];
            for (let i = 0; i < data["value"].length; i++) {
                let datastream = data["value"][i];
                let fetchedData = await fetchDeviceAndProperyFromDatastream(datastream);

                datastreams.push({
                    "name": datastream.name,
                    "description": datastream.description,
                    "unit_of_measurement": datastream.unitOfMeasurement.name + "(" + datastream.unitOfMeasurement.symbol + ")",
                    "deviceID": fetchedData.sensor,
                    "observed_property": fetchedData.property
                });
            }
            return datastreams;
        });
        result.forEach(m => all_datastreams.push(m));
    }
    let result = await fetchFromDatabase(datastreamsLink + "?$orderby=name desc&$skip=" + 100 * pages + "&$top=" + elems_last_req).then(async (data) => {
        let datastreams = [];
        for (let i = 0; i < data["value"].length; i++) {
            let datastream = data["value"][i];
            let fetchedData = await fetchDeviceAndProperyFromDatastream(datastream);

            datastreams.push({
                "name": datastream.name,
                "description": datastream.description,
                "unit_of_measurement": datastream.unitOfMeasurement.name + "(" + datastream.unitOfMeasurement.symbol + ")",
                "deviceID": fetchedData.sensor,
                "observed_property": fetchedData.property
            });
        }
        return datastreams;
    });
    result.forEach(m => all_datastreams.push(m));

    return all_datastreams;
}

async function fetchDatastreamInAField(fieldName, datastreamName) {
    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        return data["value"][0]["Datastreams@iot.navigationLink"];
    });
    return await fetchFromDatabase(datastreamsLink).then(async (data) => {
            for (let i = 0; i < data["value"].length; i++) {
                let datastream = data["value"][i];
                if (datastream.name === datastreamName) {
                    let fetchedData = await fetchDeviceAndProperyFromDatastream(datastream);

                    return {
                        "name": datastream.name,
                        "description": datastream.description,
                        "unit_of_measurement": datastream.unitOfMeasurement.name + "(" + datastream.unitOfMeasurement.symbol + ")",
                        "deviceID": fetchedData.sensor,
                        "property_name": fetchedData.property
                    }
                }
            }
        }
    );
}

async function fetchDatastream(fieldName, datastreamName) {

    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        if (!data) {
            console.log(`[ERROR] No data returned for fieldName: ${fieldName}`);
            return undefined;
        }
        if (data["@iot.count"] === 0) {
            console.log(`[ERROR] No things found for fieldName: ${fieldName}`);
            return undefined;
        }
        return data["value"][0]["Datastreams@iot.navigationLink"];
    }).catch((error) => {
        console.log(`[ERROR] Failed to fetch datastream for fieldName: ${fieldName}, error:`, error.message);
        return undefined;
    });
    if (datastreamsLink === undefined) {
        return undefined;
    }
    return await fetchAllPagesFromDatabase(datastreamsLink).then(async (data) => {
        for (let i = 0; i < data["value"].length; i++) {
            let datastream = data["value"][i];
            if (datastream.name === datastreamName) {
                return datastream;
            }
        }
        return undefined;
    });
}

async function fetchWotObservation(datastream, measure) {
    let deviceId = await fetchFromDatabase(datastream["Sensor@iot.navigationLink"] + "?$select=name").then((data) => {
        return data["name"];
    });
    let property = await fetchFromDatabase(datastream["ObservedProperty@iot.navigationLink"] + "?$select=name").then((data) => {
        return data["name"];
    });
    let unit = datastream.unitOfMeasurement.name + "(" + datastream.unitOfMeasurement.symbol + ")";
    let value = measure["result"];
    let time = measure["phenomenonTime"];
    let result_time = measure["resultTime"];
    return {
        "deviceID": deviceId,
        "property_name": property,
        "datastream_name": datastream.name,
        "unit_of_measurement": unit,
        "value": value,
        "time_of_measure": time,
        "result_time": result_time,
        "parameters": measure["parameters"]
    }
}

async function fetchAllObservationsInDatastream(fieldName, datastreamName, items, page) {
    let datastream = await fetchDatastream(fieldName, datastreamName);
    if (datastream === undefined) {
        console.log("ERROR: Datastream name might be wrong");
        return undefined;
    }
    let start_skip = items * page;
    let db_pages = Math.floor(items / 100);
    let elems_last_req = items % 100;

    let all_measures = []

    for (let i = 0; i < db_pages; i++) {
        let sk = start_skip + 100 * i
        let result = await fetchFromDatabase(datastream["Observations@iot.navigationLink"] + "?$orderby=phenomenonTime desc&$skip=" + sk).then(async (data) => {
            let measures = [];
            for (let i = 0; i < data["value"].length; i++) {
                let measure = data["value"][i];
                measures.push(await fetchWotObservation(datastream, measure));
            }
            return measures;
        });
        result.forEach(m => all_measures.push(m));
    }
    let result = await fetchFromDatabase(datastream["Observations@iot.navigationLink"] + "?$orderby=phenomenonTime desc&$skip=" + 100 * db_pages + "&$top=" + elems_last_req).then(async (data) => {
        let measures = [];
        for (let i = 0; i < data["value"].length; i++) {
            let measure = data["value"][i];
            measures.push(await fetchWotObservation(datastream, measure));
        }
        return measures;
    });
    result.forEach(m => all_measures.push(m));
    return all_measures;
}

async function fetchAllObservationsInDatastreamInRange(fieldName, datastreamName, startTime, endTime, items, page) {
    let datastream = await fetchDatastream(fieldName, datastreamName);
    if (datastream === undefined) {
        console.log("ERROR: Datastream name might be wrong");
        return undefined;
    }
    let start_skip = items * page;
    let db_pages = Math.floor(items / 100);
    let elems_last_req = items % 100;

    let all_measures = []

    let db_url = datastream["Observations@iot.navigationLink"];
    if (startTime !== "" && endTime === "") {
        db_url = db_url + "?$filter=phenomenonTime ge " + startTime;
        db_url = db_url + "&$orderby=phenomenonTime desc";
    } else if (startTime === "" && endTime !== "") {
        db_url = db_url + "?$filter=phenomenonTime le " + endTime;
        db_url = db_url + "&$orderby=phenomenonTime desc";
    } else if (startTime !== "" && endTime !== "") {
        db_url = db_url + "?$filter=phenomenonTime ge " + startTime + " and phenomenonTime le " + endTime;
        db_url = db_url + "&$orderby=phenomenonTime desc";
    } else {
        db_url = db_url + "?$orderby=phenomenonTime desc";
    }
    for (let i = 0; i < db_pages; i++) {
        let sk = start_skip + 100 * i
        let dburl = db_url + "&$skip=" + sk
        let result = await fetchFromDatabase(dburl).then(async (data) => {
            let measures = [];
            for (let i = 0; i < data["value"].length; i++) {
                let measure = data["value"][i];
                measures.push(await fetchWotObservation(datastream, measure));
            }
            return measures;
        });
        result.forEach(m => all_measures.push(m));
    }
    let dburl = db_url + "&$skip=" + 100 * db_pages + "&$top=" + elems_last_req;
    let result = await fetchFromDatabase(dburl).then(async (data) => {
        let measures = [];
        for (let i = 0; i < data["value"].length; i++) {
            let measure = data["value"][i];
            measures.push(await fetchWotObservation(datastream, measure));
        }
        return measures;
    });
    result.forEach(m => all_measures.push(m));
    return all_measures;
}

async function fetchAggregateObservationInDatastream(fieldName, datastreamName, endTime) {
    if (!datastreamName.startsWith("AVG_WEEKLY")) {
        let retval = [];
        let currentEndTime = endTime;
        for (let counter = 0; counter < 6 * 5; counter++) {
            let startTime = getOneWeekBefore(currentEndTime);
            let measures_per_page = 100, page_number = 0;

            let all_measures = [];
            while (true) {
                let measures = await fetchAllObservationsInDatastreamInRange(fieldName, datastreamName, startTime, endTime, measures_per_page, page_number);
                measures.forEach(m => all_measures.push(m));
                if (measures.length < measures_per_page) {
                    break;
                } else {
                    page_number += 1;
                }
            }

            let total_count = 0;
            all_measures.forEach(m => total_count += m["value"]);
            let average_value = total_count / all_measures.length;
            retval.push({
                "deviceID": all_measures.at(0)["deviceID"],
                "property_name": all_measures.at(0)["property_name"],
                "datastream_name": all_measures.at(0)["datastream_name"],
                "unit_of_measurement": all_measures.at(0)["unit_of_measurement"],
                "value": average_value,
                "date": currentEndTime
            });
            currentEndTime = startTime;
        }
        return retval;
    } else {
        let startTime = getSixMonthsBefore(endTime);
        let measures_per_page = 100, page_number = 0;

        let all_measures = [];
        while (true) {
            let measures = await fetchAllObservationsInDatastreamInRange(fieldName, datastreamName, startTime, endTime, measures_per_page, page_number);
            measures.forEach(m => all_measures.push(m));
            if (measures.length < measures_per_page) {
                break;
            } else {
                page_number += 1;
            }
        }
        return all_measures;
    }
}

async function fetchLastObservationInDatastream(fieldName, datastreamName) {
    let datastream = await fetchDatastream(fieldName, datastreamName);
    if (datastream === undefined) {
        console.log("ERROR: Datastream name might be wrong");
        return undefined;
    }
    return await fetchFromDatabase(datastream["Observations@iot.navigationLink"] + "?$orderby=phenomenonTime desc&$top=1").then(async (data) => {
        if (data["value"].length <= 0) {
            return undefined;
        }
        let measure = data["value"][0];
        return await fetchWotObservation(datastream, measure);
    });
}

async function fetchAllLastObservations(fieldName) {
    let datastreamsLink = await fetchFromDatabase(baseurl + "/Things?$filter=name eq '" + fieldName + "'").then((data) => {
        return data["value"][0]["Datastreams@iot.navigationLink"];
    });
    let datastreamNames = await fetchFromDatabase(datastreamsLink + "?$select=name").then((data) => {
        return data["value"];
    });
    let measures = [];
    for (let i = 0; i < datastreamNames.length; i++) {
        let measure = await fetchLastObservationInDatastream(fieldName, datastreamNames[i]["name"]);
        if (measure === undefined) {
            console.log("ERROR: Datastream name might be wrong");
            continue;
        }
        if (measure !== null) {
            measures.push(measure);
        }
    }
    return measures;
}

async function createPropertyInST(property_data) {
    let property_search_url = baseurl + "/ObservedProperties?$filter=name eq '" + property_data["name"] + "'";

    let property_from_db = await fetchFromDatabase(property_search_url).then(async (data) => {
        return data;
    });
    if (property_from_db["@iot.count"] === 0) {
        let create_property = await postToDatabase(baseurl + "/ObservedProperties", property_data);
        if (!create_property) {
            return null;
        }
        let property_search_url = baseurl + "/ObservedProperties?$filter=name eq '" + property_data["name"] + "'";

        let property_from_db = await fetchFromDatabase(property_search_url).then(async (data) => {
            return data;
        });
        return property_from_db["value"][0]["@iot.id"];
    } else {
        return property_from_db["value"][0]["@iot.id"];
    }
}

async function createSensorInST(sensor_data) {
    let sensor_search_url = baseurl + "/Sensors?$filter=name eq '" + sensor_data["name"] + "'";

    let sensor_from_db = await fetchFromDatabase(sensor_search_url).then(async (data) => {
        return data;
    });
    if (sensor_from_db["@iot.count"] === 0) {
        let create_sensor = await postToDatabase(baseurl + "/Sensors", sensor_data);
        if (!create_sensor) {
            return null;
        }
        let sensor_search_url = baseurl + "/Sensors?$filter=name eq '" + sensor_data["name"] + "'";

        let sensor_from_db = await fetchFromDatabase(sensor_search_url).then(async (data) => {
            return data;
        });
        return sensor_from_db["value"][0]["@iot.id"];
    } else {
        return sensor_from_db["value"][0]["@iot.id"];
    }
}

async function getOrCreateDatastreamInST(datastream_data) {
    let datastream_search_url = baseurl + "/Datastreams?$filter=name eq '" + datastream_data["name"] + "'";

    let datastream_from_db = await fetchFromDatabase(datastream_search_url);
    if (datastream_from_db["@iot.count"] === 0) {
        console.log("Datastream not found in DB, creating it");
        let create_datastream = await postToDatabase(baseurl + "/Datastreams", datastream_data);
        if (!create_datastream) {
            console.log("Failed to create datastream in DB");
            return null;
        }
        let datastream_search_url = baseurl + "/Datastreams?$filter=name eq '" + datastream_data["name"] + "'";

        let datastream_from_db = await fetchFromDatabase(datastream_search_url);
        return datastream_from_db["value"][0]["@iot.id"];
    } else {
        console.log("Datastream found in DB: ", datastream_from_db);
        return datastream_from_db["value"][0]["@iot.id"];
    }
}

async function produceFieldThing(thing) {
    thing.setPropertyReadHandler("fieldInformation", async () => {
        return await fetchFieldInformation(thing.getThingDescription().fieldName);
    });

    thing.setPropertyReadHandler("sensorsList", async () => {
        return await fetchSensorsInAField(thing.getThingDescription().fieldName);
    });
    thing.setPropertyReadHandler("sensorInformation", async (_params, options) => {
        let device_id;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("deviceID")) {
                throw new Error("Device ID is missing");
            }
            device_id = uriVariables["deviceID"];
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchSensorInAField(thing.getThingDescription().fieldName, device_id);
    });

    thing.setPropertyReadHandler("propertiesList", async () => {
        return await fetchPropertiesInAField(thing.getThingDescription().fieldName);
    });
    thing.setPropertyReadHandler("propertyInformation", async (_params, options) => {
        let propertyName;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("name")) {
                throw new Error("Property name is missing");
            }
            propertyName = uriVariables["name"];
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchPropertyInAField(thing.getThingDescription().fieldName, propertyName);
    });

    thing.setPropertyReadHandler("datastreamsList", async () => {
        return await fetchDatastreamsInAField(thing.getThingDescription().fieldName);
    });
    thing.setPropertyReadHandler("datastreamInformation", async (_params, options) => {
        let datastreamName;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("name")) {
                throw new Error("Datastream name is missing");
            }
            datastreamName = uriVariables["name"];
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchDatastreamInAField(thing.getThingDescription().fieldName, datastreamName);
    });

    thing.setPropertyReadHandler("datastreamLastMeasure", async (_params, options) => {
        let datastreamName;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("name")) {
                throw new Error("Datastream name is missing");
            }
            datastreamName = uriVariables["name"];
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchLastObservationInDatastream(thing.getThingDescription().fieldName, datastreamName);
    });
    thing.setPropertyReadHandler("datastreamAggregateMeasure", async (_params, options) => {
        let datastreamName, endTime;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("name")) {
                throw new Error("Datastream name is missing");
            }
            datastreamName = uriVariables["name"];
            if (!Object.keys(uriVariables).includes("time")) {
                endTime = "";
            } else {
                endTime = uriVariables["time"];
            }
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchAggregateObservationInDatastream(thing.getThingDescription().fieldName, datastreamName, endTime);
    });
    thing.setPropertyReadHandler("datastreamMeasures", async (_params, options) => {
        let datastreamName, items, page;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("name")) {
                throw new Error("Datastream name is missing");
            }
            datastreamName = uriVariables["name"];
            if (!Object.keys(uriVariables).includes("items")) {
                items = 100;
            } else {
                items = Number(uriVariables["items"]);
            }
            if (!Object.keys(uriVariables).includes("page")) {
                page = 0;
            } else {
                page = Number(uriVariables["page"]);
            }
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchAllObservationsInDatastream(thing.getThingDescription().fieldName, datastreamName, items, page);
    });
    thing.setPropertyReadHandler("datastreamTimeRangeMeasures", async (_params, options) => {
        let datastreamName, startTime, endTime, items, page;
        if (_params && typeof _params === "object" && "uriVariables" in _params) {
            const uriVariables = _params.uriVariables;
            if (!Object.keys(uriVariables).includes("name")) {
                throw new Error("Datastream name is missing");
            }
            if (!Object.keys(uriVariables).includes("start_time")) {
                startTime = "";
            } else {
                startTime = uriVariables["start_time"];
            }
            if (!Object.keys(uriVariables).includes("end_time")) {
                endTime = "";
            } else {
                endTime = uriVariables["end_time"];
            }
            datastreamName = uriVariables["name"];
            if (!Object.keys(uriVariables).includes("items")) {
                items = 100;
            } else {
                items = Number(uriVariables["items"]);
            }
            if (!Object.keys(uriVariables).includes("page")) {
                page = 0;
            } else {
                page = Number(uriVariables["page"]);
            }
        } else {
            throw new Error("Uri variables is missing");
        }
        return await fetchAllObservationsInDatastreamInRange(thing.getThingDescription().fieldName, datastreamName, startTime, endTime, items, page);
    });
    thing.setPropertyReadHandler("lastMeasures", async (_params, options) => {
        return await fetchAllLastObservations(thing.getThingDescription().fieldName);
    });


    thing.setPropertyReadHandler("modelOutputs", async (_params, options) => {
        //http://localhost/acquaountpinos/properties/modelOutputs

        // Check if this is a basin or field thing
        const thingType = thing.getThingDescription().thingType;
        let twoDaysAgo = new Date();
        twoDaysAgo.setHours(0, 0, 0, 0);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        let sevenDaysAhead = new Date();
        sevenDaysAhead.setHours(0, 0, 0, 0);
        sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 8);

        let daily_irr_volume_observations = await fetchAllObservationsInDatastreamInRange(thing.getThingDescription().fieldName, thing.getThingDescription().fieldName + "_DailyIrrigationGivenPrediction", formatDate(twoDaysAgo), formatDate(sevenDaysAhead), 330, 0);
        let daily_irr_deficit_observations = await fetchAllObservationsInDatastreamInRange(thing.getThingDescription().fieldName, thing.getThingDescription().fieldName + "_DailyIrrigationDeficitPrediction", formatDate(twoDaysAgo), formatDate(sevenDaysAhead), 330, 0);
        let daily_soil_m_observations = await fetchAllObservationsInDatastreamInRange(thing.getThingDescription().fieldName, thing.getThingDescription().fieldName + "_DailySoilMoisturePrediction", formatDate(twoDaysAgo), formatDate(sevenDaysAhead), 330, 0);

        if (daily_irr_volume_observations === undefined || daily_irr_deficit_observations === undefined || daily_soil_m_observations === undefined) {
            return {result: false, message: 'No observations found'};
        }

        let time_of_measure = new Set();
        daily_irr_volume_observations.forEach(item => {
            time_of_measure.add(item.time_of_measure);
        });
        daily_irr_deficit_observations.forEach(item => {
            time_of_measure.add(item.time_of_measure);
        });
        daily_soil_m_observations.forEach(item => {
            time_of_measure.add(item.time_of_measure);
        });
        time_of_measure = Array.from(time_of_measure).sort();
        daily_irr_volume_values = []
        daily_irr_deficit_values = []
        daily_soil_m_values = []

        function getLatestValueForTime(observations, time) {
            let observations_for_the_day = observations.filter(item => item.time_of_measure == time);
            observations_for_the_day.sort((a, b) => new Date(b.result_time) - new Date(a.result_time));
            if (observations_for_the_day.length > 0) {
                return observations_for_the_day[0].value;
            } else {
                return null;
            }
        }

        time_of_measure.forEach(time => {
            daily_irr_volume_values.push(getLatestValueForTime(daily_irr_volume_observations, time));
            daily_irr_deficit_values.push(getLatestValueForTime(daily_irr_deficit_observations, time));
            daily_soil_m_values.push(getLatestValueForTime(daily_soil_m_observations, time));
        });


        time_of_measure_string = time_of_measure.map(item => item.split("T")[0]);
        let irrigation_dates = await fetchFieldIrrigationDates(thing.getThingDescription().fieldName);
        let today_date = new Date();
        today_date.setHours(0, 0, 0, 0);
        let vertical_lines = [{"today": today_date.toISOString().split("T")[0]}];
        Object.keys(irrigation_dates).forEach(key => {
            vertical_lines.push({[key]: irrigation_dates[key]});
        });
        return {
            "labels": time_of_measure_string,
            "datasets": [
                {
                    "label": "Suggested full irrigation",
                    "data": daily_irr_volume_values
                },
                {
                    "label": "Suggested deficit irrigation",
                    "data": daily_irr_deficit_values
                },
                {
                    "label": "Soil moisture (%)",
                    "data": daily_soil_m_values
                }
            ],
            "verticalLines": vertical_lines
        }

    });

    thing.setActionHandler("receiveMeasure", async (_params, options) => {
        const params = await _params.value();
        if (!Object.keys(params).includes("info")) {
            return {result: false, message: 'Info missing in message'};
        }
        if (!Object.keys(params['info']).includes("deviceID")) {
            return {result: false, message: 'Device ID missing in message'};
        }

        if (!Object.keys(params).includes("values")) {
            return {result: false, message: 'Values missing in message'};
        }
        let sensorName = params["info"]["deviceID"];
        for (let i = 0; i < Object.keys(params["values"]).length; i++) {
            let propertyName = Object.keys(params["values"])[i];
            let url = baseurl + "/Datastreams?" +
                "$filter=(Sensor/name eq '" + sensorName + "') and " +
                "(ObservedProperty/name eq '" + propertyName + "') and " +
                "(Thing/name eq '" + thing.getThingDescription().fieldName + "')"
            let result = await fetchFromDatabase(url);
            if (result['@iot.count'] === 0) {
                return {result: false, message: 'Sensor and key value do not specify a datastream'};
            }
            let datastreamId = 0;
            result.value.forEach(item => {
                if (!item.name.includes("AVG_WEEKLY")) {
                    datastreamId = item["@iot.id"];
                }
            });
            url = baseurl + "/Datastreams(" + datastreamId + ")/Observations";
            let phenomTime;
            if (Object.keys(params['info']).includes("timestamp")) {
                phenomTime = params['info']['timestamp'];
            } else {
                phenomTime = formatDate(new Date());
            }
            let observation_body = {
                result: params["values"][propertyName],
                phenomenonTime: phenomTime
            };
            if (Object.keys(params['info']).includes("resultTime")) {
                observation_body.resultTime = params['info']['resultTime'];
            }
            if (Object.keys(params['info']).includes("parameters")) {
                observation_body.parameters = params['info']['parameters'];
            }

            let response = await postToDatabase(url, observation_body);
            if (!response) {
                return {result: false, message: 'Something failed when accessing the database'};
            }
            await writeToCSV(sensorName, observation_body.phenomenonTime);
            thing.emitEvent("newObservation", {
                deviceID: sensorName,
                observedProperty: propertyName,
                value: observation_body.result,
                time: observation_body.phenomenonTime
            });
        }
        return {result: true, message: 'Observation(s) stored successfully'};
    });

    thing.setActionHandler("sendCommand", async (_params, options) => {
        const params = await _params.value();
        if (!Object.keys(params).includes("values")) {
            return {result: false, message: 'values missing in message'};
        }
        if (!Object.keys(params["values"]).includes("action_type")) {
            return {result: false, message: 'action_type missing in message'};
        }
        let actionType = params["values"]["action_type"];

        let endpoint = ""
        if (actionType === "irrigate" || actionType === "uplink_frequency_change") {
            endpoint = "https://y7hjs81225.execute-api.eu-west-1.amazonaws.com/external/snd_eut_data";
        } else if (actionType === "device_status") {
            endpoint = "https://y7hjs81225.execute-api.eu-west-1.amazonaws.com/external/get_eut_data";
        } else {
            return {result: false, message: 'action_type not supported'};
        }
        let requestBody = JSON.stringify(params);
        const reqOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'UBEyNRVJfl5PXZbQ0ksIW91DVb7CysrO17ln63gN'
            },
            body: requestBody
        };
        let response = await fetch(endpoint, reqOptions).then(function (response) {
            return response;
        });
        return await response.json();
    });

    thing.setActionHandler("createSensor", async (_params, options) => {
        const params = await _params.value();
        if (!Object.keys(params).includes("values")) {
            return {result: false, message: 'values missing in message'};
        }
        // TODO Rebre paràmetres d'entrada

        let sens = {
            datastreams: [
                {
                    property_key: "air_temperature",
                    property_name: "Air Temperature",
                },
                {
                    property_key: "air_humidity",
                    property_name: "Air Humidity",
                }
            ]
        }

        for (let datastr in sens["datastreams"]) {

        }

        return {message: 'Function not yet implemented'}
    });

    thing.getThingDescription().href = "84.88.76.18";

    thing.expose().then(() => {
        console.info(`${thing.getThingDescription().title} ready`);
    });
    console.log(`Produced ${thing.getThingDescription().title}`);
}

servient.start().then(async (WoT) => {
    let mainJson = readJsonFileSync('src/resources/thingDescription/main.td.json');
    let creationPath = 'src/resources/thingDescription/Fields/Custom/'

    mainJson['base'] = config_baseurl;

    WoT.produce(mainJson).then((thing) => {
        thing.setActionHandler("createThing", async (_params, options) => {
            const params = await _params.value();
            if (!Object.keys(params).includes("fieldName")) {
                return {status: false, message: 'Field name missing in message'};
            }
            if (!Object.keys(params).includes("username")) {
                return {status: false, message: 'Username missing in message'};
            }
            if (!Object.keys(params).includes("environment")) {
                return {status: false, message: 'Environment missing in message'};
            }
            let desc = "";
            if (Object.keys(params).includes("description")) {
                desc = params["description"];
            } else {
                desc = "Field " + params["username"] + "-" + params["fieldName"] + "-" + params["environment"];
            }

            let fieldFinalName = params["username"] + "-" + params["fieldName"] + "-" + params["environment"];
            fieldFinalName = fieldFinalName.replace(/\s+/g, '');
            // Replace accented characters with their unaccented equivalents
            fieldFinalName = fieldFinalName.normalize("NFD");
            fieldFinalName = fieldFinalName.replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
            let fieldId = fieldFinalName;
            let fieldExists = false;
            Object.values(servient.getThings()).forEach(thing => {
                if (thing.title === fieldFinalName) {
                    fieldExists = true;
                    return
                }
            });

            if (fieldExists) {
                throw new Error('Field already exists');
            }

            let jsonField = {
                "id": "acquaount:" + fieldId,
                "title": fieldFinalName,
                "fieldName": fieldFinalName,
                "description": fieldFinalName
            };

            fs.writeFileSync(creationPath + fieldId + ".td.json", JSON.stringify(jsonField), {flag: 'w'}, function (err) {
                if (err) {
                    console.log(err);
                    return {status: true, message: 'Error writing the thing file'};
                }
            });

            // Model running is handled by another service
            /*
            let runInfo = {
                "fieldTitle": fieldFinalName,
                "username": params["username"],
                "fieldName": params["fieldName"]
            }

            fs.writeFileSync("src/resources/modelService/Irrigation Model/runs/" + fieldFinalName.toLowerCase() + ".run.json", JSON.stringify(runInfo), {flag: 'w'}, function (err) {
                if (err) {
                    console.log(err);
                    return {status: true, message: 'Error writing the run file'};
                }
            });
            */

            let things_url = baseurl + "/Things"
            let thing_body = {
                "name": fieldFinalName,
                "description": fieldFinalName,
                "properties": {
                    "username": params["username"],
                    "fieldName": params["fieldName"],
                    "pilot": "Custom",
                    "earlyIrrigationDate": "",
                    "lateIrrigationDate": "",
                    "limitIrrigationDate": ""
                }
            };

            let response = await postToDatabase(things_url, thing_body);
            if (!response) {
                return {result: false, message: 'Something failed when accessing the database'};
            }

            let jsonBase = readJsonFileSync('src/resources/thingDescription/Fields/base.td.json');

            for (const key in jsonField) {
                jsonBase[key] = jsonField[key];
            }

            let thingId = await fetchFromDatabase(things_url + "?$filter=name eq '" + fieldFinalName + "'").then(async (data) => {
                return data["value"][0]["@iot.id"];
            });
            console.log("Thing ID: ", thingId);

            await setThingLocation(thingId, 0.0, 0.0);

            sensor_data = {
                "name": fieldFinalName,
                "description": "Model outputs for a field",
                "encodingType": "application/pdf",
                "properties": {},
                "metadata": "Sensor"
            }
            let sensorId = await createSensorInST(sensor_data);

            properties_units = {
                "Irrigation Volume Prediction": "m3",
                "Irrigation Deficit Prediction": "m3",
                "Soil Moisture Prediction": "%",
                "Daily Irrigation Given Prediction": "m3",
                "Daily Irrigation Deficit Prediction": "m3",
                "Daily Soil Moisture Prediction": "%"
            }

            properties_data = [
                {
                    "name": "Irrigation Volume Prediction",
                    "description": "Irrigation Volume Prediction, result of the irrigation model",
                    "definition": "Irrigation Volume",
                    "properties": {}
                },
                {
                    "name": "Irrigation Deficit Prediction",
                    "description": "Irrigation Deficit Prediction, result of the irrigation model",
                    "definition": "Irrigation Deficit",
                    "properties": {}
                }, {
                    "name": "Soil Moisture Prediction",
                    "description": "Soil Moisture Prediction, result of the irrigation model",
                    "definition": "Soil Moisture",
                    "properties": {}
                }, {
                    "name": "Daily Irrigation Given Prediction",
                    "description": "Daily Irrigation Given Prediction, result of the irrigation model",
                    "definition": "Irrigation Given",
                    "properties": {}
                },
                {
                    "name": "Daily Irrigation Deficit Prediction",
                    "description": "Daily Irrigation Deficit Prediction, result of the irrigation model",
                    "definition": "Daily Irrigation Deficit",
                    "properties": {}
                },
                {
                    "name": "Daily Soil Moisture Prediction",
                    "description": "Daily Soil Moisture Prediction, result of the irrigation model",
                    "definition": "Daily Soil Moisture",
                    "properties": {}
                }
            ]

            for (let propert of properties_data) {
                let propertyId = await createPropertyInST(propert);

                let datastream_data = {
                    "name": fieldFinalName + "_" + propert["name"].replaceAll(" ", ""),
                    "description": propert["description"],
                    "observationType": "Measurement",
                    "unitOfMeasurement": {
                        "name": properties_units[propert["name"]],
                        "symbol": properties_units[propert["name"]],
                        "definition": properties_units[propert["name"]]
                    },
                    "Thing": {
                        "@iot.id": thingId.toString()
                    },
                    "Sensor": {
                        "@iot.id": sensorId.toString()
                    },
                    "ObservedProperty": {
                        "@iot.id": propertyId.toString()
                    }
                }

                await getOrCreateDatastreamInST(datastream_data);
            }

            WoT.produce(jsonBase).then((thing2) => {
                produceFieldThing(thing2);
            }).catch((e) => {
                console.log(e);
            });

            return {status: true, message: 'Thing created successfully', thingId: fieldFinalName};
        });

        thing.setActionHandler("listThings", async (_params, options) => {
            const params = await _params.value();
            if (!Object.keys(params).includes("thingType")) {
                return {status: false, message: 'thingType missing in message'};
            }
            let thingType = params["thingType"];
            let thingsList = [];
            Object.values(servient.getThings()).forEach(thing => {
                if (thing.thingType == thingType) {
                    thingsList.push({
                        title: thing.title,
                        id: thing.id,
                        thingType: thing.thingType
                    });
                }
            });


            return {status: true, message: 'Things listed successfully', things: thingsList};

        });
        thing.expose().then(() => {
            console.info(`${thing.getThingDescription().title} ready`);
        });
        console.log(`Produced ${thing.getThingDescription().title}`);
    }).catch((e) => {
        console.log(e);
    });

    /* FIELDS */
    let patterns = [
        'src/resources/thingDescription/Fields/**.td.json',
        'src/resources/thingDescription/Fields/*/*.td.json',
    ]

    let filenames = [];
    for (const pattern of patterns) {
        filenames = filenames.concat(glob.globSync(pattern));
    }

    for (let i = 0; i < filenames.length; i++) {
        filenames[i] = filenames[i].replace(/\\/g, "/");
    }

    for (let i = 0; i < filenames.length; i++) {
        if (filenames[i] === 'src/resources/thingDescription/Fields/base.td.json') {
            continue;
        }
        let jsonBase = readJsonFileSync('src/resources/thingDescription/Fields/base.td.json');
        let jsonSpecific = readJsonFileSync(filenames[i]);

        for (const key in jsonSpecific) {
            jsonBase[key] = jsonSpecific[key];
        }

        jsonBase['base'] = config_baseurl;

        WoT.produce(jsonBase).then((thing) => {
            produceFieldThing(thing);
        }).catch((e) => {
            console.log(e);
        });
    }

    /* BASIN WATER RESOURCE */
    patterns = [
        'src/resources/thingDescription/Basin/WaterResource/**.td.json',
        'src/resources/thingDescription/Basin/WaterResource/*/*.td.json',
        'src/resources/thingDescription/Basin/WaterDemand/**.td.json',
        'src/resources/thingDescription/Basin/WaterDemand/*/*.td.json',
    ]

    filenames = [];
    for (const pattern of patterns) {
        filenames = filenames.concat(glob.globSync(pattern));
    }

    for (let i = 0; i < filenames.length; i++) {
        filenames[i] = filenames[i].replace(/\\/g, "/");
    }

    for (let i = 0; i < filenames.length; i++) {
        if (filenames[i] === 'src/resources/thingDescription/Basin/WaterResource/base.td.json') {
            continue;
        }
        let jsonBase = readJsonFileSync('src/resources/thingDescription/Basin/WaterResource/base.td.json');
        let jsonSpecific = readJsonFileSync(filenames[i]);

        for (const key in jsonSpecific) {
            jsonBase[key] = jsonSpecific[key];
        }

        jsonBase['base'] = config_baseurl;

        WoT.produce(jsonBase).then((thing) => {
            thing.setPropertyReadHandler("fieldInformation", async () => {
                return await fetchFieldInformation(thing.getThingDescription().itemName);
            });

            thing.setPropertyReadHandler("modelOutputs", async (_params, options) => {
                return await fetchBasinInformation(thing.getThingDescription().itemName);
                // return {result: true, message: 'Model outputs not yet implemented'};
            });

            thing.setPropertyReadHandler("urbanDemand", async (_params, options) => {
                return await fetchUrbanDemand(thing.getThingDescription().itemName);
            });

            thing.setPropertyReadHandler("sensorsList", async () => {
                return await fetchSensorsInAField(thing.getThingDescription().itemName);
            });
            thing.setPropertyReadHandler("sensorInformation", async (_params, options) => {
                let device_id;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("deviceID")) {
                        throw new Error("Device ID is missing");
                    }
                    device_id = uriVariables["deviceID"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchSensorInAField(thing.getThingDescription().itemName, device_id);
            });

            thing.setPropertyReadHandler("propertiesList", async () => {
                return await fetchPropertiesInAField(thing.getThingDescription().itemName);
            });
            thing.setPropertyReadHandler("propertyInformation", async (_params, options) => {
                let propertyName;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Property name is missing");
                    }
                    propertyName = uriVariables["name"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchPropertyInAField(thing.getThingDescription().itemName, propertyName);
            });

            thing.setPropertyReadHandler("datastreamsList", async () => {
                return await fetchDatastreamsInAField(thing.getThingDescription().itemName);
            });
            thing.setPropertyReadHandler("datastreamInformation", async (_params, options) => {
                let datastreamName;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchDatastreamInAField(thing.getThingDescription().itemName, datastreamName);
            });

            thing.setPropertyReadHandler("datastreamLastMeasure", async (_params, options) => {
                let datastreamName;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchLastObservationInDatastream(thing.getThingDescription().itemName, datastreamName);
            });
            thing.setPropertyReadHandler("datastreamAggregateMeasure", async (_params, options) => {
                let datastreamName, endTime;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                    if (!Object.keys(uriVariables).includes("time")) {
                        endTime = "";
                    } else {
                        endTime = uriVariables["time"];
                    }
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchAggregateObservationInDatastream(thing.getThingDescription().itemName, datastreamName, endTime);
            });
            thing.setPropertyReadHandler("datastreamMeasures", async (_params, options) => {
                let datastreamName, items, page;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                    if (!Object.keys(uriVariables).includes("items")) {
                        items = 100;
                    } else {
                        items = Number(uriVariables["items"]);
                    }
                    if (!Object.keys(uriVariables).includes("page")) {
                        page = 0;
                    } else {
                        page = Number(uriVariables["page"]);
                    }
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchAllObservationsInDatastream(thing.getThingDescription().itemName, datastreamName, items, page);
            });
            thing.setPropertyReadHandler("datastreamTimeRangeMeasures", async (_params, options) => {
                let datastreamName, startTime, endTime, items, page;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    if (!Object.keys(uriVariables).includes("start_time")) {
                        startTime = "";
                    } else {
                        startTime = uriVariables["start_time"];
                    }
                    if (!Object.keys(uriVariables).includes("end_time")) {
                        endTime = "";
                    } else {
                        endTime = uriVariables["end_time"];
                    }
                    datastreamName = uriVariables["name"];
                    if (!Object.keys(uriVariables).includes("items")) {
                        items = 100;
                    } else {
                        items = Number(uriVariables["items"]);
                    }
                    if (!Object.keys(uriVariables).includes("page")) {
                        page = 0;
                    } else {
                        page = Number(uriVariables["page"]);
                    }
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchAllObservationsInDatastreamInRange(thing.getThingDescription().itemName, datastreamName, startTime, endTime, items, page);
            });
            thing.setPropertyReadHandler("lastMeasures", async (_params, options) => {
                return await fetchAllLastObservations(thing.getThingDescription().itemName);
            });

            thing.setPropertyReadHandler("historicalData", async (_params, options) => {
                return await fetchHistoricalData(thing.getThingDescription().itemName);
            });

            thing.setActionHandler("receiveMeasure", async (_params, options) => {
                const params = await _params.value();
                console.log(params);
                if (!Object.keys(params).includes("info")) {
                    return {result: false, message: 'Info missing in message'};
                }
                if (!Object.keys(params['info']).includes("deviceID")) {
                    return {result: false, message: 'Device ID missing in message'};
                }

                if (!Object.keys(params).includes("values")) {
                    return {result: false, message: 'Values missing in message'};
                }
                let sensorName = params["info"]["deviceID"];
                for (let i = 0; i < Object.keys(params["values"]).length; i++) {
                    let propertyName = Object.keys(params["values"])[i];
                    let url = baseurl + "/Datastreams" +
                        "?$filter=(Sensor/name eq '" + sensorName + "') and " +
                        "(ObservedProperty/name eq '" + propertyName + "') and " +
                        "(Thing/name eq '" + thing.getThingDescription().itemName + "')"
                    let result = await fetchFromDatabase(url);
                    if (result['@iot.count'] === 0) {
                        return {result: false, message: 'Sensor and key value do not specify a datastream'};
                    }
                    let datastreamId = 0;
                    result.value.forEach(item => {
                        if (!item['name'].includes("AVG_WEEKLY")) {
                            datastreamId = item["@iot.id"];
                        }
                    });
                    url = baseurl + "/Datastreams(" + datastreamId + ")/Observations";
                    let phenomTime;
                    if (Object.keys(params['info']).includes("timestamp")) {
                        phenomTime = params['info']['timestamp'];
                    } else {
                        phenomTime = formatDate(new Date());
                    }
                    let observation_body = {
                        result: params["values"][propertyName],
                        phenomenonTime: phenomTime

                    };
                    if (Object.keys(params['info']).includes("resultTime")) {
                        observation_body.resultTime = params['info']['resultTime'];
                    }
                    if (Object.keys(params['info']).includes("parameters")) {
                        observation_body.parameters = params['info']['parameters'];
                    }
                    let response = await postToDatabase(url, observation_body);
                    if (!response) {
                        return {result: false, message: 'Something failed when accessing the database'};
                    }
                    await writeToCSV(sensorName, observation_body.phenomenonTime);
                    thing.emitEvent("newObservation", {
                        deviceID: sensorName,
                        observedProperty: propertyName,
                        value: observation_body.result,
                        time: observation_body.phenomenonTime
                    });
                }
                return {result: true, message: 'Observation(s) stored successfully'};
            });

            thing.setActionHandler("sendCommand", async (_params, options) => {
                const params = await _params.value();
                if (!Object.keys(params).includes("values")) {
                    return {result: false, message: 'values missing in message'};
                }
                if (!Object.keys(params["values"]).includes("action_type")) {
                    return {result: false, message: 'action_type missing in message'};
                }
                let actionType = params["values"]["action_type"];

                let endpoint = ""
                if (actionType === "irrigate" || actionType === "uplink_frequency_change") {
                    endpoint = "https://y7hjs81225.execute-api.eu-west-1.amazonaws.com/external/snd_eut_data";
                } else if (actionType === "device_status") {
                    endpoint = "https://y7hjs81225.execute-api.eu-west-1.amazonaws.com/external/get_eut_data";
                } else {
                    return {result: false, message: 'action_type not supported'};
                }
                let requestBody = JSON.stringify(params);
                const reqOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': 'UBEyNRVJfl5PXZbQ0ksIW91DVb7CysrO17ln63gN'
                    },
                    body: requestBody
                };
                let response = await fetch(endpoint, reqOptions).then(function (response) {
                    return response;
                });
                return await response.json();
            });

            thing.getThingDescription().href = "84.88.76.18";

            thing.expose().then(() => {
                console.info(`${thing.getThingDescription().title} ready`);
            });
            console.log(`Produced ${thing.getThingDescription().title}`);
        }).catch((e) => {
            console.log(e);
        });
    }

    /* STATIONS */
    patterns = [
        'src/resources/thingDescription/Stations/**.td.json',
        'src/resources/thingDescription/Stations/*/*.td.json',
    ]

    filenames = [];
    for (const pattern of patterns) {
        filenames = filenames.concat(glob.globSync(pattern));
    }

    for (let i = 0; i < filenames.length; i++) {
        filenames[i] = filenames[i].replace(/\\/g, "/");
    }

    for (let i = 0; i < filenames.length; i++) {
        if (filenames[i] === 'src/resources/thingDescription/Stations/base.td.json') {
            continue;
        }
        let jsonBase = readJsonFileSync('src/resources/thingDescription/Stations/base.td.json');
        let jsonSpecific = readJsonFileSync(filenames[i]);

        for (const key in jsonSpecific) {
            jsonBase[key] = jsonSpecific[key];
        }

        jsonBase['base'] = config_baseurl;

        WoT.produce(jsonBase).then((thing) => {
            thing.setPropertyReadHandler("stationInformation", async () => {
                return await fetchFieldInformation(thing.getThingDescription().stationName);
            });

            thing.setPropertyReadHandler("propertiesList", async () => {
                return await fetchPropertiesInAField(thing.getThingDescription().stationName);
            });
            thing.setPropertyReadHandler("propertyInformation", async (_params, options) => {
                let propertyName;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Property name is missing");
                    }
                    propertyName = uriVariables["name"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchPropertyInAField(thing.getThingDescription().stationName, propertyName);
            });

            thing.setPropertyReadHandler("datastreamsList", async () => {
                return await fetchDatastreamsInAField(thing.getThingDescription().stationName);
            });
            thing.setPropertyReadHandler("datastreamInformation", async (_params, options) => {
                let datastreamName;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchDatastreamInAField(thing.getThingDescription().stationName, datastreamName);
            });

            thing.setPropertyReadHandler("datastreamLastMeasure", async (_params, options) => {
                let datastreamName;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchLastObservationInDatastream(thing.getThingDescription().stationName, datastreamName);
            });
            thing.setPropertyReadHandler("datastreamAggregateMeasure", async (_params, options) => {
                let datastreamName, endTime;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                    if (!Object.keys(uriVariables).includes("time")) {
                        endTime = "";
                    } else {
                        endTime = uriVariables["time"];
                    }
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchAggregateObservationInDatastream(thing.getThingDescription().stationName, datastreamName, endTime);
            });
            thing.setPropertyReadHandler("datastreamMeasures", async (_params, options) => {
                let datastreamName, items, page;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    datastreamName = uriVariables["name"];
                    if (!Object.keys(uriVariables).includes("items")) {
                        items = 100;
                    } else {
                        items = Number(uriVariables["items"]);
                    }
                    if (!Object.keys(uriVariables).includes("page")) {
                        page = 0;
                    } else {
                        page = Number(uriVariables["page"]);
                    }
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchAllObservationsInDatastream(thing.getThingDescription().stationName, datastreamName, items, page);
            });
            thing.setPropertyReadHandler("datastreamTimeRangeMeasures", async (_params, options) => {
                let datastreamName, startTime, endTime, items, page;
                if (_params && typeof _params === "object" && "uriVariables" in _params) {
                    const uriVariables = _params.uriVariables;
                    if (!Object.keys(uriVariables).includes("name")) {
                        throw new Error("Datastream name is missing");
                    }
                    if (!Object.keys(uriVariables).includes("start_time")) {
                        startTime = "";
                    } else {
                        startTime = uriVariables["start_time"];
                    }
                    if (!Object.keys(uriVariables).includes("end_time")) {
                        endTime = "";
                    } else {
                        endTime = uriVariables["end_time"];
                    }
                    datastreamName = uriVariables["name"];
                    if (!Object.keys(uriVariables).includes("items")) {
                        items = 100;
                    } else {
                        items = Number(uriVariables["items"]);
                    }
                    if (!Object.keys(uriVariables).includes("page")) {
                        page = 0;
                    } else {
                        page = Number(uriVariables["page"]);
                    }
                } else {
                    throw new Error("Uri variables is missing");
                }
                return await fetchAllObservationsInDatastreamInRange(thing.getThingDescription().stationName, datastreamName, startTime, endTime, items, page);
            });
            thing.setPropertyReadHandler("lastMeasures", async (_params, options) => {
                return await fetchAllLastObservations(thing.getThingDescription().stationName);
            });

            thing.setActionHandler("receiveMeasure", async (_params, options) => {
                const params = await _params.value();
                if (!Object.keys(params).includes("info")) {
                    return {result: false, message: 'Info missing in message'};
                }
                if (!Object.keys(params['info']).includes("deviceID")) {
                    return {result: false, message: 'Device ID missing in message'};
                }
                if (!Object.keys(params).includes("values")) {
                    return {result: false, message: 'Values missing in message'};
                }
                let sensorName = params["info"]["deviceID"];
                for (let i = 0; i < Object.keys(params["values"]).length; i++) {
                    let propertyName = Object.keys(params["values"])[i];
                    let url = baseurl + "/Datastreams?" +
                        "$filter=(Sensor/name eq '" + sensorName + "') and " +
                        "(ObservedProperty/name eq '" + propertyName + "') and " +
                        "(Thing/name eq '" + thing.getThingDescription().stationName + "')"
                    let result = await fetchFromDatabase(url);
                    if (result['@iot.count'] === 0) {
                        return {result: false, message: 'Sensor and key value do not specify a datastream'};
                    }
                    let datastreamId = 0;
                    result.value.forEach(ds => {
                        if (!ds['name'].includes("AVG_WEEKLY")) {
                            datastreamId = ds["@iot.id"];
                        }
                    });
                    url = baseurl + "/Datastreams(" + datastreamId + ")/Observations";
                    let phenomTime;
                    if (Object.keys(params['info']).includes("timestamp")) {
                        phenomTime = params['info']['timestamp'];
                    } else {
                        phenomTime = formatDate(new Date());
                    }

                    let observation_body = {
                        result: params["values"][propertyName],
                        phenomenonTime: phenomTime
                    };
                    if (Object.keys(params['info']).includes("resultTime")) {
                        observation_body.resultTime = params['info']['resultTime'];
                    }
                    if (Object.keys(params['info']).includes("parameters")) {
                        observation_body.parameters = params['info']['parameters'];
                    }
                    let response = await postToDatabase(url, observation_body);
                    if (!response) {
                        return {result: false, message: 'Something failed when accessing the database'};
                    }
                    await writeToCSV(sensorName, observation_body.phenomenonTime);
                    thing.emitEvent("newObservation", {
                        deviceID: sensorName,
                        observedProperty: propertyName,
                        value: observation_body.result,
                        time: observation_body.phenomenonTime
                    });
                }
                return {result: true, message: 'Observation(s) stored successfully'};
            });

            thing.setActionHandler("sendCommand", async (_params, options) => {
                const params = await _params.value();
                if (!Object.keys(params).includes("values")) {
                    return {result: false, message: 'values missing in message'};
                }
                if (!Object.keys(params["values"]).includes("action_type")) {
                    return {result: false, message: 'action_type missing in message'};
                }
                let actionType = params["values"]["action_type"];

                let endpoint = ""
                if (actionType === "irrigate" || actionType === "uplink_frequency_change") {
                    endpoint = "https://y7hjs81225.execute-api.eu-west-1.amazonaws.com/external/snd_eut_data";
                } else if (actionType === "device_status") {
                    endpoint = "https://y7hjs81225.execute-api.eu-west-1.amazonaws.com/external/get_eut_data";
                } else {
                    return {result: false, message: 'action_type not supported'};
                }
                let requestBody = JSON.stringify(params);
                const reqOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': 'UBEyNRVJfl5PXZbQ0ksIW91DVb7CysrO17ln63gN'
                    },
                    body: requestBody
                };
                let response = await fetch(endpoint, reqOptions).then(function (response) {
                    return response;
                });
                return await response.json();
            });

            thing.getThingDescription().href = "84.88.76.18";

            thing.expose().then(() => {
                console.info(`${thing.getThingDescription().title} ready`);
            });
            console.log(`Produced ${thing.getThingDescription().title}`);
        }).catch((e) => {
            console.log(e);
        });
    }


    /* START SERVER */
});
