import csv
import json
import sys

import requests as r

import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

baseurl = "http://sensorthings-api:8080/FROST-Server/v1.1"

if __name__ in "__main__":
    print(sys.argv[0])
    if len(sys.argv) < 2:
        print("Filename missing")
        sys.exit(-2)
    if len(sys.argv) < 3:
        print("Url missing, using default")
    else:
        baseurl = sys.argv[2]
    with open(sys.argv[1], "r", errors="ignore") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            # Thing
            if row['Field Name'] == "":
                continue
            thing_res = r.get(f"{baseurl}/Things?$filter=name eq '{row['Field Name']}'", verify=False)
            if thing_res.status_code != 200:
                print("Error in request")
                # sys.exit(-1)
                continue
            thing_json = thing_res.json()
            if thing_json["@iot.count"] == 0:
                thing_body = {}
                thing_body["name"] = row.get("Field Name", "")
                thing_body["description"] = row.get("Field Description", "")
                thing_body["properties"] = {}
                thing_body["properties"]["pilot"] = row.get("Pilot", "")
                response = r.post(f"{baseurl}/Things", data=json.dumps(thing_body), verify=False)
                print(response.status_code)
            thing_res = r.get(f"{baseurl}/Things?$filter=name eq '{row['Field Name']}'", verify=False)
            thing_id = int(thing_res.json()["value"][0]["@iot.id"])
            # Location
            location_res = r.get(f"{baseurl}/Locations?$filter=name eq '{row['Field Name']}'", verify=False)
            location_json = location_res.json()
            if location_json["@iot.count"] == 0:
                location_body = {}
                location_body["name"] = row.get("Field Name", "")
                location_body["description"] = row.get("Field Description", "")
                location_body["encodingType"] = "application/geo+json"
                location_body["location"] = {}
                location_body["location"]["type"] = "Point"
                try:
                    location_body["location"]["coordinates"] = [float(row.get("Field Longitude", "").replace(",", ".")),
                                                                float(row.get("Field Latitude", "").replace(",", "."))]
                except ValueError:
                    location_body["location"]["coordinates"] = [0.0, 0.0]
                location_body["Things"] = [{
                    "@iot.id": str(thing_id)
                }]
                response = r.post(f"{baseurl}/Locations", data=json.dumps(location_body), verify=False)
                print(response.status_code)
            else:
                things_req = r.get(
                    location_json["value"][0]["Things@iot.navigationLink"].replace("localhost",
                                                                                   "84.88.76.18/wotst").replace("http",
                                                                                                                "https"),
                    verify=False)
                for thing in things_req.json()["value"]:
                    if int(thing["@iot.id"]) == thing_id:
                        break
                else:
                    new_things = [{'@iot.id': t['@iot.id']} for t in things_req.json()["value"]]
                    new_things.append({'@iot.id': str(thing_id)})
                    response = r.patch(f"{baseurl}/Locations({location_json['value'][0]['@iot.id']})", data={
                        "Things": new_things
                    }, verify=False)
            location_res = r.get(f"{baseurl}/Locations?$filter=name eq '{row['Field Name']}'", verify=False)
            location_id = location_res.json()["value"][0]["@iot.id"]
            # ObservedProperty
            property_res = r.get(f"{baseurl}/ObservedProperties?$filter=name eq '{row['Property Key']}'", verify=False)
            if property_res.status_code != 200:
                print("Error in request")
                # sys.exit(-1)
                continue
            property_json = property_res.json()
            if property_json["@iot.count"] == 0:
                property_body = {}
                property_body["name"] = row.get("Property Key", "")
                property_body["description"] = row.get("Property Description", "")
                property_body["definition"] = row.get("Property Description", "")
                response = r.post(f"{baseurl}/ObservedProperties", data=json.dumps(property_body), verify=False)
                print(response.status_code)
            property_res = r.get(f"{baseurl}/ObservedProperties?$filter=name eq '{row['Property Key']}'", verify=False)
            property_id = int(property_res.json()["value"][0]["@iot.id"])
            # Sensor
            sensor_res = r.get(f"{baseurl}/Sensors?$filter=name eq '{row['Device ID']}'", verify=False)
            if sensor_res.status_code != 200:
                print("Error in request")
                # sys.exit(-1)
                continue
            sensor_json = sensor_res.json()
            if sensor_json["@iot.count"] == 0:
                sensor_body = {}
                sensor_body["name"] = row.get("Device ID", "")
                sensor_body["description"] = row.get("Device Description", "")
                sensor_body["encodingType"] = "application/pdf"
                sensor_body["metadata"] = row.get("Device Description", "")
                sensor_body["properties"] = {
                    "deviceType": row.get("Device Type", ""),
                    "deviceEUI": row.get("Device EUI", "")
                }
                response = r.post(f"{baseurl}/Sensors", data=json.dumps(sensor_body), verify=False)
                print(response.status_code)
            sensor_res = r.get(f"{baseurl}/Sensors?$filter=name eq '{row['Device ID']}'", verify=False)
            sensor_id = int(sensor_res.json()["value"][0]["@iot.id"])
            # Datastream
            datastream_res = r.get(f"{baseurl}/Datastreams?$filter=name eq '{row['Datastream Name']}'", verify=False)
            if datastream_res.status_code != 200:
                print("Error in request")
                # sys.exit(-1)
                continue
            datastream_json = datastream_res.json()
            if datastream_json["@iot.count"] == 0:
                datastream_body = {}
                datastream_body["name"] = row.get("Datastream Name", "")
                datastream_body["description"] = row.get("Datastream Description", "")
                datastream_body["observationType"] = "Measurement"
                datastream_body["unitOfMeasurement"] = {
                    "name": row.get("Unit Of Measurement", ""),
                    "symbol": row.get("Unit Of Measurement Symbol", ""),
                    "definition": row.get("Unit Of Measurement", "")
                }
                datastream_body["Thing"] = {
                    "@iot.id": str(thing_id)
                }
                datastream_body["Sensor"] = {
                    "@iot.id": str(sensor_id)
                }
                datastream_body["ObservedProperty"] = {
                    "@iot.id": str(property_id)
                }
                response = r.post(f"{baseurl}/Datastreams", data=json.dumps(datastream_body), verify=False)
                print(response.status_code)

            # Aggregates
            if row['Averages'] == 'Weekly':
                average_datastream_name = "AVG_WEEKLY_" + row['Datastream Name']
                datastream_res = r.get(f"{baseurl}/Datastreams?$filter=name eq '{average_datastream_name}'",
                                       verify=False)
                if datastream_res.status_code != 200:
                    print("Error in request")
                    # sys.exit(-1)
                    continue
                datastream_json = datastream_res.json()
                if datastream_json["@iot.count"] == 0:
                    datastream_body = {}
                    datastream_body["name"] = average_datastream_name
                    datastream_body["description"] = "[WEEKLY AVERAGE] " + row.get("Datastream Description", "")
                    datastream_body["observationType"] = "Measurement"
                    datastream_body["unitOfMeasurement"] = {
                        "name": row.get("Unit Of Measurement", ""),
                        "symbol": row.get("Unit Of Measurement Symbol", ""),
                        "definition": row.get("Unit Of Measurement", "")
                    }
                    datastream_body["Thing"] = {
                        "@iot.id": str(thing_id)
                    }
                    datastream_body["Sensor"] = {
                        "@iot.id": str(sensor_id)
                    }
                    datastream_body["ObservedProperty"] = {
                        "@iot.id": str(property_id)
                    }
                    response = r.post(f"{baseurl}/Datastreams", data=json.dumps(datastream_body), verify=False)
                    print(response.status_code)
