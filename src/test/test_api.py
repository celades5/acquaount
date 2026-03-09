import datetime
import requests
import json

baseurl = "http://127.0.0.1:2080"


class TestCreateNewThings:
    def test_createNewThings_successful(self):
        fieldName = "TestField" + datetime.datetime.now().strftime("%Y%m%d%H%M%S")

        url = baseurl + f"/{fieldName.lower()}/properties/fieldInformation"

        response = requests.request("GET", url, headers={}, data={})

        assert response.status_code == 404  # Field has not yet been created

        url = baseurl + "/main/actions/createThing"

        payload = json.dumps({
            "fieldName": fieldName,
            "username": "DevTestEurecat",
            "environment": "Testing",
            "description": "New Test Field"
        })
        headers = {
            'Content-Type': 'application/json'
        }

        response = requests.request("POST", url, headers=headers, data=payload)

        assert response.status_code == 200
        assert response.json()["status"] == True

        url = baseurl + f"/{fieldName.lower()}/properties/fieldInformation"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200


class TestReadInstancesFromCSV:
    def test_readFieldProperties_successful(self):
        url = baseurl + f"/acquaountthingdemosite/properties/fieldInformation"

        response = requests.request("GET", url, headers={}, data={})
        assert response.status_code == 200
        response_json = response.json()
        assert "name" in response_json
        assert "description" in response_json
        assert "pilot" in response_json
        assert "location" in response_json

    def test_readFieldPropertiesIncorrect_failed(self):
        url = baseurl + f"/nonexistingfield/properties/fieldInformation"

        response = requests.request("GET", url, headers={}, data={})
        assert response.status_code == 404

    def test_readListOfThings_returnsNonEmptyList(self):
        response = requests.request("GET", baseurl, headers={}, data={})
        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == list
        assert len(response_json) > 0

    def test_readSensorList_returnsNonEmptyListWithCorrectInstance(self):
        url = baseurl + "/acquaountthingdemosite/properties/sensorsList"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200
        assert type(response.json()) == list
        assert len(response.json()) > 0
        assert "name" in response.json()[0]
        assert "@iot.id" in response.json()[0]

    def test_readSensorInformation_returnsCorrectInstance(self):
        url = baseurl + "/acquaountthingdemosite/properties/sensorInformation?deviceID=D001"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == dict
        assert "name" in response_json
        assert "@iot.id" in response_json

    def test_readSensorInformation_returnsError_sensorDoesNotExist(self):
        url = baseurl + "/acquaountthingdemosite/properties/sensorInformation?deviceID=FakeSensor"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 500

    def test_readSensorInformation_returnsError_sensorExistsInDifferentThing(self):
        url = baseurl + "/acquaountthingdemosite/properties/sensorInformation?deviceID=F001"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 500

    def test_readPropertyList_returnsNonEmptyListWithCorrectInstance(self):
        url = baseurl + "/acquaountthingdemosite/properties/propertiesList"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200
        assert type(response.json()) == list
        assert len(response.json()) > 0
        assert "name" in response.json()[0]
        assert "@iot.id" in response.json()[0]

    def test_readPropertyInformation_returnsCorrectInstance(self):
        url = baseurl + "/acquaountthingdemosite/properties/propertyInformation?name=air_temperature"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == dict
        assert "name" in response_json
        assert "@iot.id" in response_json

    def test_readPropertyInformation_returnsError_propertyDoesNotExist(self):
        url = baseurl + "/acquaountthingdemosite/properties/propertyInformation?name=FakeProperty"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 500

    def test_readPropertyInformation_returnsError_propertyExistsInDifferentThing(self):
        url = baseurl + "/acquaountthingdemosite/properties/propertyInformation?name=battery_level"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 500

    def test_readDatastreamList_returnsNonEmptyListWithCorrectInstance(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamsList"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200
        assert type(response.json()) == list
        assert len(response.json()) > 0
        assert "name" in response.json()[0]

    def test_readDatastreamInformation_returnsCorrectInstance(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamInformation?name=Demo_Field_D001_Air_Humidity"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == dict
        assert "name" in response_json

    def test_readDatastreamInformation_returnsError_datastreamDoesNotExist(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamInformation?name=FakeDatastream"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 500

    def test_readDatastreamInformation_returnsError_datastreamExistsInDifferentThing(self):
        url = baseurl + "/acquaountthingdemosite/properties/propertyInformation?name=New_Field_F001_Battery_Level"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)

        assert response.status_code == 500


class TestCreateObservations:
    def test_createObservation_successful(self):
        measure_body = {
            "info": {
                "deviceID": "D001",
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            },
            "values": {
                "air_humidity": 68
            }
        }

        headers = {
            'Content-Type': 'application/json'
        }

        url = baseurl + "/acquaountthingdemosite/actions/receiveMeasure"
        response = requests.request("POST", url, headers=headers, json=measure_body)

        assert response.status_code == 200
        assert "result" in response.json()
        assert response.json()["result"] == True

    def test_createObservation_returnsError_incorrectDevice(self):
        measure_body = {
            "info": {
                "deviceID": "D002",
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            },
            "values": {
                "air_humidity": 68
            }
        }

        headers = {
            'Content-Type': 'application/json'
        }

        url = baseurl + "/acquaountthingdemosite/actions/receiveMeasure"
        response = requests.request("POST", url, headers=headers, json=measure_body)

        assert response.status_code == 500

    def test_createObservation_returnsError_incorrectPropertyKey(self):
        measure_body = {
            "info": {
                "deviceID": "D001",
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            },
            "values": {
                "Fake Property": 68
            }
        }

        headers = {
            'Content-Type': 'application/json'
        }

        url = baseurl + "/acquaountthingdemosite/actions/receiveMeasure"
        response = requests.request("POST", url, headers=headers, json=measure_body)

        assert response.status_code == 500


class TestGetMeasures:
    def test_datastreamLastMeasure_successful(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamLastMeasure?name=Demo_Field_D001_Air_Humidity"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == dict
        assert "deviceID" in response_json
        assert "property_name" in response_json
        assert "datastream_name" in response_json
        assert "unit_of_measurement" in response_json
        assert "value" in response_json
        assert "time_of_measure" in response_json

    def test_datastreamLastMeasure_noMeasures(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamLastMeasure?name=Demo_Field_D001_Air_Temperature"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        assert response.text == ""

    def test_datastreamLastMeasure_returnsError_datastreamDoesNotExist(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamLastMeasure?name=FakeDatastream"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_datastreamLastMeasure_returnsError_datastreamExistsInDifferentThing(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamLastMeasure?name=New_Field_F001_Battery_Level"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_datastreamMeasures_successful(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamMeasures?name=Demo_Field_D001_Air_Humidity"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == list
        assert len(response_json) > 0
        assert "deviceID" in response_json[0]
        assert "property_name" in response_json[0]
        assert "datastream_name" in response_json[0]
        assert "unit_of_measurement" in response_json[0]
        assert "value" in response_json[0]
        assert "time_of_measure" in response_json[0]

    def test_datastreamMeasures_noMeasures(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamMeasures?name=Demo_Field_D001_CO2_Concentration"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == list
        assert len(response_json) == 0

    def test_datastreamMeasures_returnsError_datastreamDoesNotExist(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamMeasures?name=FakeDatastream"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_datastreamMeasures_returnsError_datastreamExistsInDifferentThing(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamMeasures?name=New_Field_F001_Battery_Level"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_datastreamMeasuresTimeRange_successful(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamTimeRangeMeasures?start_time=2024-02-25T10:00:00Z&end_time=2030-03-11T10:00:00Z&items=100&page=0&name=Demo_Field_D001_Air_Humidity"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        response_json = response.json()
        assert type(response_json) == list
        assert len(response_json) > 0
        assert "deviceID" in response_json[0]
        assert "property_name" in response_json[0]
        assert "datastream_name" in response_json[0]
        assert "unit_of_measurement" in response_json[0]
        assert "value" in response_json[0]
        assert "time_of_measure" in response_json[0]

    def test_datastreamMeasuresTimeRange_returnsError_datastreamDoesNotExist(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamTimeRangeMeasures?name=FakeDatastream"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_datastreamMeasuresTimeRange_returnsError_datastreamExistsInDifferentThing(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamTimeRangeMeasures?name=New_Field_F001_Battery_Level"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_datastreamMeasuresTimeRange_returnsError_incorrectDateFormat(self):
        url = baseurl + "/acquaountthingdemosite/properties/datastreamTimeRangeMeasures?start_time=25-02-2025T10:00:00Z&end_time=2030-Oct-11T10:00:00&items=100&page=0&name=Demo_Field_D001_Air_Humidity"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 500

    def test_lastMeasures_successful(self):
        url = baseurl + "/acquaountthingdemosite/properties/lastMeasures"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        response_json = response.json()
        assert type(response.json()) == list
        assert len(response_json) > 0

    def test_lastMeasures_noMeasures(self):
        url = baseurl + "/acquaountthingnewsite/properties/lastMeasures"

        payload = {}
        headers = {}

        response = requests.request("GET", url, headers=headers, data=payload)
        assert response.status_code == 200
        response_json = response.json()
        assert type(response.json()) == list
        assert len(response_json) == 0
