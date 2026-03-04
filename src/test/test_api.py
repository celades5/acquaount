import datetime
import requests
import json

baseurl = "http://127.0.0.1:2080"

class TestCreateNewThings:
    def test_createNewThings_successful(self):
        fieldName = "TestField" + datetime.datetime.now().strftime("%Y%m%d%H%M%S")

        url = baseurl + f"/{fieldName.lower()}/properties/fieldInformation"

        response = requests.request("GET", url, headers={}, data={})

        assert response.status_code == 404 # Field has not yet been created

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
        raise NotImplementedError

    def test_readSensorInformation_returnsCorrectInstance(self):
        raise NotImplementedError

    def test_readSensorInformation_returnsError_sensorDoesNotExist(self):
        raise NotImplementedError

    def test_readSensorInformation_returnsError_sensorExistsInDifferentThing(self):
        raise NotImplementedError

    def test_readPropertyList_returnsNonEmptyListWithCorrectInstance(self):
        raise NotImplementedError

    def test_readPropertyInformation_returnsCorrectInstance(self):
        raise NotImplementedError

    def test_readPropertyInformation_returnsError_propertyDoesNotExist(self):
        raise NotImplementedError

    def test_readPropertyInformation_returnsError_propertyExistsInDifferentThing(self):
        raise NotImplementedError

    def test_readDatastreamList_returnsNonEmptyListWithCorrectInstance(self):
        raise NotImplementedError

    def test_readDatastreamInformation_returnsCorrectInstance(self):
        raise NotImplementedError

    def test_readDatastreamInformation_returnsError_datastreamDoesNotExist(self):
        raise NotImplementedError

    def test_readDatastreamInformation_returnsError_datastreamExistsInDifferentThing(self):
        raise NotImplementedError


class TestCreateObservations:
    def test_createObservation_successful(self):
        raise NotImplementedError

    def test_createObservation_returnsError_incorrectDevice(self):
        raise NotImplementedError

    def test_createObservation_returnsError_incorrectPropertyKey(self):
        raise NotImplementedError


class TestGetMeasures:
    def test_datastreamLastMeasure_successful(self):
        raise NotImplementedError

    def test_datastreamLastMeasure_returnsError_datastreamDoesNotExist(self):
        raise NotImplementedError

    def test_datastreamLastMeasure_returnsError_datastreamExistsInDifferentThing(self):
        raise NotImplementedError

    def test_datastreamMeasures_successful(self):
        raise NotImplementedError

    def test_datastreamMeasures_paginatesCorrectly(self):
        raise NotImplementedError

    def test_datastreamMeasures_returnsError_datastreamDoesNotExist(self):
        raise NotImplementedError

    def test_datastreamMeasures_returnsError_datastreamExistsInDifferentThing(self):
        raise NotImplementedError

    def test_datastreamMeasuresTimeRange_successful(self):
        raise NotImplementedError

    def test_datastreamMeasuresTimeRange_paginatesCorrectly(self):
        raise NotImplementedError

    def test_datastreamMeasuresTimeRange_returnsError_datastreamDoesNotExist(self):
        raise NotImplementedError

    def test_datastreamMeasuresTimeRange_returnsError_datastreamExistsInDifferentThing(self):
        raise NotImplementedError

    def test_datastreamMeasuresTimeRange_returnsError_incorrectDateFormat(self):
        raise NotImplementedError

    def test_datastreamMeasuresTimeRange_returnsError_incorrectDateRange(self):
        raise NotImplementedError

    def test_lastMeasures_successful(self):
        raise NotImplementedError
