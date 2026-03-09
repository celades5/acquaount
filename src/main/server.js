// server.js
if (Number(process.version.slice(1).split(".")[0]) < 18) {
    throw new Error("Invalid Node.js version: " + process.version);
}

// Required steps to create a servient for creating a thing
const Servient = require('@node-wot/core').Servient;
const HttpServer = require('@node-wot/binding-http').HttpServer;

const glob = require('glob');

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
const config_baseuri = config['baseuri'];
const froststring = "/FROST-Server/v1.1"
const baseurl = urlhost + froststring
console.log("Database url:", baseurl)

const servient = new Servient();
servient.addServer(new HttpServer({
    port: 80,
    baseUri: config_baseuri,
    updateInteractionNameWithUriVariablePattern: false
}));

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
    if (result === undefined) {
        return result;
    }
    result["location"] = await fetchFromDatabase(locationsUrl).then((data) => {
        var location = data["value"][0];
        if (location === undefined) {
            return {}
        }
        return location["location"];
    })
    return result;
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
        throw new Error("Sensor not found in this field");
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
    throw new Error("Property not found in this field");
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
            throw new Error("Datastream not found in this field");
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
        throw new Error("Datastream not found in this field");
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
        throw new Error("Datastream not found in this field");
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
        throw new Error("Datastream not found in this field");
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

    thing.setActionHandler("receiveMeasure", async (_params, options) => {
        const params = await _params.value();
        if (!Object.keys(params).includes("info")) {
            throw new Error('Info missing in message');
        }
        if (!Object.keys(params['info']).includes("deviceID")) {
            throw new Error('Device ID is missing');
        }

        if (!Object.keys(params).includes("values")) {
            throw new Error('Values missing in message');
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
                throw new Error('Sensor and key value do not specify a datastream');
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
                throw new Error('Something failed when accessing the database');
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

    thing.getThingDescription().href = config_baseuri;

    thing.expose().then(() => {
        console.info(`${thing.getThingDescription().title} ready`);
    });
    console.log(`Produced ${thing.getThingDescription().title}`);
}

servient.start().then(async (WoT) => {
    let mainJson = readJsonFileSync('src/resources/thingDescription/main.td.json');
    let creationPath = 'src/resources/thingDescription/Things/'

    mainJson['base'] = config_baseurl;

    WoT.produce(mainJson).then((thing) => {
        thing.setActionHandler("createThing", async (_params, options) => {
            const params = await _params.value();
            if (!Object.keys(params).includes("fieldName")) {
                throw new Error('Field name missing in message')
            }
            let desc = "";
            if (Object.keys(params).includes("description")) {
                desc = params["description"];
            } else {
                desc = params["fieldName"];
            }

            let fieldFinalName = params["fieldName"];
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
                "description": desc
            };

            fs.writeFileSync(creationPath + fieldId + ".td.json", JSON.stringify(jsonField), {flag: 'w'}, function (err) {
                if (err) {
                    console.log(err);
                    throw new Error('Error writing the thing file');
                }
            });

            let things_url = baseurl + "/Things"
            let thing_body = {
                "name": fieldFinalName,
                "description": fieldFinalName,
                "properties": {
                    "fieldName": params["fieldName"],
                    "pilot": "Custom",
                }
            };

            let response = await postToDatabase(things_url, thing_body);
            if (!response) {
                throw new Error('Something failed when accessing the database');
            }

            let jsonBase = readJsonFileSync('src/resources/thingDescription/Things/base.td.json');

            for (const key in jsonField) {
                jsonBase[key] = jsonField[key];
            }

            let thingId = await fetchFromDatabase(things_url + "?$filter=name eq '" + fieldFinalName + "'").then(async (data) => {
                return data["value"][0]["@iot.id"];
            });
            console.log("Thing ID: ", thingId);

            await setThingLocation(thingId, 0.0, 0.0);

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
                if (thing.thingType === thingType) {
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

    /* CREATE THINGS */
    let patterns = [
        'src/resources/thingDescription/Things/**.td.json',
        'src/resources/thingDescription/Things/*/*.td.json',
    ]

    let filenames = [];
    for (const pattern of patterns) {
        filenames = filenames.concat(glob.globSync(pattern));
    }

    for (let i = 0; i < filenames.length; i++) {
        filenames[i] = filenames[i].replace(/\\/g, "/");
    }

    for (let i = 0; i < filenames.length; i++) {
        if (filenames[i] === 'src/resources/thingDescription/Things/base.td.json') {
            continue;
        }
        let jsonBase = readJsonFileSync('src/resources/thingDescription/Things/base.td.json');
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
});
