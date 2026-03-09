# API Documentation

This file includes all endpoints available in WoT-Server. Keep in mind that this documentation does not include
FROST-Server related endpoints, they can be found in
the [FROST-Server's documentation](https://fraunhoferiosb.github.io/FROST-Server/).  

The WoT-Server only ever returns 200 status codes for successful operations, 500 status codes for failed or incorrect operations, and 404 status codes for routing mistakes, because the WoT syntax is designed to be protocol agnostic, only ever differentiating between success and error instead of different types of errors, however, all failed or incorrect operations return a string in the body describing what the error was. Only separating between success and error instead of different types of errors opens the door to developers that might want to use WoT-Server using a protocol that isn't HTTP. 

## Create Thing

**Method:** `POST`  
**Endpoint:** `/main/actions/createThing`

### Description

This request is used to create new Things in the WoT-Server. The new things created with this method are designed to be
used for model outputs, so they are created with those datastreams by default.

### Request Body

| Field       | Type   | Required | Description                                    |
|-------------|--------|----------|------------------------------------------------|
| fieldName   | string | Yes      | The name to assign to the newly created field  |
| username    | string | Yes      | The username that creates the field            |
| environment | string | No       | An optional environment to create the field in |
| description | string | No       | A description that will be added to the field  |

### Return Codes

| Code | Meaning                                                     |
|------|-------------------------------------------------------------|
| 200  | Success                                                     |
| 500  | Field already exists, field has no location, or other error |

### Request Example

```json
{
  "fieldName": "TestFieldForPostman",
  "username": "DevTestEurecat",
  "environment": "Testing",
  "description": "New Test Field"
}
```

### Request Success Example

```json
{
  "status": true,
  "message": "Thing created successfully",
  "thingId": "devtesteurecat-testfieldforpostman-testing"
}
```

## Read Field Properties

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/fieldInformation`

### Description

This request is used to read the Properties of a field in the WoT-Server, which contain the name, description,
associated Pilot location, and coordinates.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Return Codes

| Code | Meaning                                           |
|------|---------------------------------------------------|
| 200  | Request successful                                |
| 500  | Field is not found in the database or other error |

### Request Success Example

```json
{
  "name": "Demo Field",
  "description": "Demo sensors in ABI",
  "pilot": "Demo",
  "location": {
    "type": "Point",
    "coordinates": [
      8.56432347,
      40.72700569
    ]
  }
}
```

## List Of Things

**Method:** `GET`  
**Endpoint:** `/`

### Description

This request returns, in a list, all the active things in the WoT-Server. The URLs returned however will not be
functional, since they are prefixed with the internal IP and not the external, accessible one.

### Return Codes

| Code | Meaning            |
|------|--------------------|
| 200  | Request is correct |

### Request Success Example

```json
[
  "http://172.18.0.4:80/main",
  "http://172.18.0.4:80/mynewfield"
]
```

## Read Sensor List

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/sensorsList`

### Description

This request will return a list of all the sensors associated with the specified thing. It will also return internal
links to related datastreams in the SensorThings server.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Return Codes

| Code | Meaning                                           |
|------|---------------------------------------------------|
| 200  | Request successful                                |
| 500  | Field is not found in the database or other error |

### Request Success Example

```json
[
  {
    "@iot.selfLink": "http://localhost:8008/FROST-Server/v1.1/Sensors(1)",
    "@iot.id": 1,
    "name": "D001",
    "description": "Compact and versatile environmental sensor module designed for monitoring temperature and humidity in various applications.",
    "encodingType": "application/pdf",
    "metadata": "Compact and versatile environmental sensor module designed for monitoring temperature and humidity in various applications.",
    "properties": {},
    "Datastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/Sensors(1)/Datastreams",
    "MultiDatastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/Sensors(1)/MultiDatastreams"
  }
]
```

## Read Sensor Information

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/sensorInformation`

### Description

This request is used to create new Things in the WoT-Server. The new things created with this method are designed to be
used for model outputs, so they are created with those datastreams by default.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Query Parameters

| Name     | Type   | Required | Description                                |
|----------|--------|----------|--------------------------------------------|
| deviceID | string | Yes      | The deviceID of the sensor being requested |

### Return Codes

| Code | Meaning                                                              |
|------|----------------------------------------------------------------------|
| 200  | Request correct                                                      |
| 500  | The field or the sensor are not found in the database or other error |

### Request Success Example

```json
{
  "@iot.selfLink": "http://localhost:8008/FROST-Server/v1.1/Sensors(1)",
  "@iot.id": 1,
  "name": "D001",
  "description": "Compact and versatile environmental sensor module designed for monitoring temperature and humidity in various applications.",
  "encodingType": "application/pdf",
  "metadata": "Compact and versatile environmental sensor module designed for monitoring temperature and humidity in various applications.",
  "properties": {},
  "Datastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/Sensors(1)/Datastreams",
  "MultiDatastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/Sensors(1)/MultiDatastreams"
}
```

## Read Properties List

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/propertiesList`

### Description

This request will return a list of all the properties being observed in this specified thing. It will also return
internal links to related datastreams in the SensorThings server.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Return Codes

| Code | Meaning                                           |
|------|---------------------------------------------------|
| 200  | Request successful                                |
| 500  | Field is not found in the database or other error |

### Request Success Example

```json
[
  {
    "@iot.selfLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(1)",
    "@iot.id": 1,
    "name": "air_temperature",
    "definition": "The measure of the hotness or coldness of the air.",
    "description": "The measure of the hotness or coldness of the air.",
    "Datastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(1)/Datastreams",
    "MultiDatastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(1)/MultiDatastreams"
  },
  {
    "@iot.selfLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(2)",
    "@iot.id": 2,
    "name": "air_humidity",
    "definition": "The amount of moisture or water vapor present in the air, often expressed as a percentage of the maximum amount the air could hold at a given temperature.",
    "description": "The amount of moisture or water vapor present in the air, often expressed as a percentage of the maximum amount the air could hold at a given temperature.",
    "Datastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(2)/Datastreams",
    "MultiDatastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(2)/MultiDatastreams"
  }
]
```

## Read Property Information

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/propertyInformation`

### Description

This request will return the information of one specific observed property, defined in the query parameters. It will be
successful if the property exists in the database even if it is not being observed within the specified thing.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Query Parameters

| Name | Type   | Required | Description                              |
|------|--------|----------|------------------------------------------|
| name | string | Yes      | The name of the property being requested |

### Return Codes

| Code | Meaning                                                                 |
|------|-------------------------------------------------------------------------|
| 200  | Request correct                                                         |
| 500  | The field or the property are not found in the database, or other error |

### Request Success Example

```json
{
  "@iot.selfLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(1)",
  "@iot.id": 1,
  "name": "air_temperature",
  "definition": "The measure of the hotness or coldness of the air.",
  "description": "The measure of the hotness or coldness of the air.",
  "Datastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(1)/Datastreams",
  "MultiDatastreams@iot.navigationLink": "http://localhost:8008/FROST-Server/v1.1/ObservedProperties(1)/MultiDatastreams"
}
```

## Read Datastreams List

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/datastreamsList`

### Description

This request will return the list of all the datastreams being observed in the specified thing. It will also include the
names of the sensor that feeds this datastream, and the property being observed.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Return Codes

| Code | Meaning                                           |
|------|---------------------------------------------------|
| 200  | Request successful                                |
| 500  | Field is not found in the database or other error |

### Request Success Example

```json
[
  {
    "name": "Demo_Field_D005_system_voltage",
    "description": "The datastream containing mesures of field Demo Field by sensor D005 which measures Battery Voltage.",
    "unit_of_measurement": "Millivolts(mV)",
    "deviceID": "D005",
    "observed_property": "system_voltage"
  },
  {
    "name": "Demo_Field_D005_leak",
    "description": "The datastream containing mesures of field Demo Field by sensor D005 which measures Leak warning.",
    "unit_of_measurement": "True / False(N/A)",
    "deviceID": "D005",
    "observed_property": "leak"
  }
]
```

## Read Datastreams Information

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/datastreamInformation`

### Description

This request will return the information on one datastream, specified in the query parameters. It will also include the
names of the sensor that feeds this datastream, and the property being observed. It will not be successful if the
datastream is not part of this thing, even if it does exist in the database.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Query Parameters

| Name | Type   | Required | Description                               |
|------|--------|----------|-------------------------------------------|
| name | string | Yes      | The name of the datstream being requested |

### Return Codes

| Code | Meaning                                                                   |
|------|---------------------------------------------------------------------------|
| 200  | Request correct                                                           |
| 500  | The field or the datastream are not found in the database, or other error |

### Request Success Example

```json
{
  "name": "Demo_Field_D001_air_humidity",
  "description": "The datastream containing mesures of field Demo Field by sensor D001 which measures Air Humidity.",
  "unit_of_measurement": "Percentage(%)",
  "deviceID": "D001",
  "property_name": "air_humidity"
}
```

## Create Observations

**Method:** `POST`  
**Endpoint:** `/<thing_title>/actions/receiveMeasure`

### Description

This request is used to create a measure/observation in a datastream. The thing is defined using the url, and the sensor
and observed property using the request body. The three objects identify a unique datastream. The request will fail if a
datastream is not identified. It will also use the current time if the timestamp property is missing.

### Request Body

| Field                 | Type   | Required | Description                                                                                                       |
|-----------------------|--------|----------|-------------------------------------------------------------------------------------------------------------------|
| info                  | object | Yes      | Object that contains information on the measures                                                                  |
| info.deviceID         | string | Yes      | The ID of the sensor that captured these measures                                                                 |
| info.timestamp        | string | No       | The timestamp of the measures in YYYY-MM-DDThh:mm:ssZ format                                                      |
| values                | object | Yes      | Object that contains the values of the measures                                                                   |
| values.<property_key> | number | Yes      | A key value pair where the key identifies the property. Multiple key value pairs can be sent in the same request. |

### Return Codes

| Code | Meaning                                        |
|------|------------------------------------------------|
| 200  | Success                                        |
| 500  | Field not found in the database or other error |

### Request Example

```json
{
  "info": {
    "deviceID": "D001",
    "timestamp": "2026-11-01T09:02:00Z"
  },
  "values": {
    "Air Humidity": 68
  }
}
```

### Request Success Example

```json
{
  "result": true,
  "message": "Observation(s) stored successfully"
}
```

## Datastream Last Measure

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/datastreamLastMeasure`

### Description

This request will return the latest measure that has been stored in the specified datastream. It will not be successful
if the datastream is not part of this thing or if it doesn't have any measures.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Query Parameters

| Name | Type   | Required | Description                               |
|------|--------|----------|-------------------------------------------|
| name | string | Yes      | The name of the datstream being requested |

### Return Codes

| Code | Meaning                                            |
|------|----------------------------------------------------|
| 200  | Success                                            |
| 500  | Request is not formatted correctly, or other error |

### Request Success Example

```json
{
  "deviceID": "D001",
  "property_name": "air_temperature",
  "datastream_name": "Demo_Field_D001_air_temperature",
  "unit_of_measurement": "Degrees Celsius(ºC)",
  "value": 26.87,
  "time_of_measure": "2026-01-09T10:48:52Z",
  "result_time": null
}
```

## Datastream Measures

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/datastreamMeasures`

### Description

This request will return the latest measures stored in the specified datastream. It will return the measures in inverse
chronological order (the most recent measure first) and the items and page query parameters are used to page the
results.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Query Parameters

| Name  | Type   | Required | Description                                                      |
|-------|--------|----------|------------------------------------------------------------------|
| name  | string | Yes      | The name of the datstream being requested                        |
| items | number | No       | The number of items to return at once in a page. Defaults to 100 |
| page  | number | No       | Used to page the results. Defaults to 0                          |

### Return Codes

| Code | Meaning                                                                   |
|------|---------------------------------------------------------------------------|
| 200  | Request received correctly                                                |
| 500  | The field or the datastream are not found in the database, or other error |

### Request Success Example

```json
[
  {
    "deviceID": "D001",
    "property_name": "air_temperature",
    "datastream_name": "Demo_Field_D001_air_temperature",
    "unit_of_measurement": "Degrees Celsius(\ufffdC)",
    "value": 26.87,
    "time_of_measure": "2026-01-09T10:48:52Z",
    "result_time": null
  },
  {
    "deviceID": "D001",
    "property_name": "air_temperature",
    "datastream_name": "Demo_Field_D001_air_temperature",
    "unit_of_measurement": "Degrees Celsius(\ufffdC)",
    "value": 23.33,
    "time_of_measure": "2026-01-08T10:49:08Z",
    "result_time": null
  },
  ...
]
```

## Datastream Measures Time Range

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/datastreamTimeRangeMeasures`

### Description

This request will return a list of measures stored in the specified datastream. It will return the measures in inverse
chronological order (the most recent measure first) and the items and page query parameters are used to page the
results. The start_time and end_time are used to specifiy a time range of the requested measures, in the format
YYYY-MM-DDThh:mm:ssZ.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Query Parameters

| Name       | Type        | Required | Description                                                                                                       |
|------------|-------------|----------|-------------------------------------------------------------------------------------------------------------------|
| name       | string      | Yes      | The name of the datstream being requested                                                                         |
| items      | number      | No       | The number of items to return at once in a page. Defaults to 100                                                  |
| page       | number      | No       | Used to page the results. Defaults to 0                                                                           |
| start_time | date string | No       | The start date of the range of data being requested. Defaults to the date of the oldest measure of the datastream |
| end_time   | date string | No       | The end date of the range of data being requested. Defaults to the current time                                   |

### Return Codes

| Code | Meaning                                                                   |
|------|---------------------------------------------------------------------------|
| 200  | Request received correctly                                                |
| 500  | The field or the datastream are not found in the database, or other error |

### Request Success Example

```json
[
  {
    "deviceID": "D001",
    "property_name": "air_temperature",
    "datastream_name": "Demo_Field_D001_air_temperature",
    "unit_of_measurement": "Degrees Celsius(\ufffdC)",
    "value": 26.87,
    "time_of_measure": "2026-01-09T10:48:52Z",
    "result_time": null
  },
  {
    "deviceID": "D001",
    "property_name": "air_temperature",
    "datastream_name": "Demo_Field_D001_air_temperature",
    "unit_of_measurement": "Degrees Celsius(\ufffdC)",
    "value": 23.33,
    "time_of_measure": "2026-01-08T10:49:08Z",
    "result_time": null
  },
  ...
]
```

## Last Measures

**Method:** `GET`  
**Endpoint:** `/<thing_title>/properties/lastMeasures`

### Description

This request will return the latest measure that has been stored in each of the datastreams associated with this thing.

### URL Variables

| Name        | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| thing_title | string | Yes      | The thing title of the thing being requested |

### Return Codes

| Code | Meaning                                                |
|------|--------------------------------------------------------|
| 200  | Request received correctly                             |
| 500  | The field is not found in the database, or other error |

### Request Success Example

```json
[
  {
    "deviceID": "D001",
    "property_name": "air_temperature",
    "datastream_name": "Demo_Field_D001_air_temperature",
    "unit_of_measurement": "Degrees Celsius(�C)",
    "value": 107000,
    "time_of_measure": "2026-11-01T09:01:00Z",
    "result_time": null
  },
  {
    "deviceID": "D001",
    "property_name": "air_humidity",
    "datastream_name": "Demo_Field_D001_air_humidity",
    "unit_of_measurement": "Percentage(%)",
    "value": 41.33,
    "time_of_measure": "2026-03-04T10:38:09Z",
    "result_time": null
  },
  ...
]
```