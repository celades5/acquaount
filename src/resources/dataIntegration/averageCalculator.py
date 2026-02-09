import datetime
import json
import math

import requests as r
import urllib3
from tqdm import tqdm

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

serverUrl = "http://sensorthings-api:8080"


def calculate_averages():
    skip = 0
    num_of_ds = 100

    createds = 0

    while num_of_ds >= 100:
        req = r.get(serverUrl + f"/FROST-Server/v1.1/Datastreams?$skip={skip}", verify=False)

        all_datastreams = json.loads(req.text)["value"]
        num_of_ds = len(all_datastreams)
        skip += num_of_ds

        for datastream in tqdm(all_datastreams):
            if "AVG_WEEKLY_" not in datastream['name']:
                continue

            normal_datastream_name = datastream['name'].replace("AVG_WEEKLY_", "")
            og_datastream_res = r.get(
                f"{serverUrl}/FROST-Server/v1.1/Datastreams?$filter=name eq '{normal_datastream_name}'", verify=False)
            if og_datastream_res.status_code != 200:
                print("Error in request")
                continue
            og_datastream = json.loads(og_datastream_res.text)["value"][0]
            observations_url_base = str(og_datastream['Observations@iot.navigationLink']).replace(
                "http://localhost:8008", serverUrl)

            today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).strftime(
                "%Y-%m-%dT%H:%M:%SZ")
            last_week = datetime.datetime.now() - datetime.timedelta(days=7)
            time_s = last_week.strftime("%Y-%m-%dT%H:%M:%SZ")

            observations_url = observations_url_base + f"?$filter=phenomenonTime ge {time_s}"

            measures_skip = 0
            measures_num = 100

            total_measures = 0
            total_value = 0

            has_measures = False

            while measures_num >= 100:
                req = r.get(observations_url + f"&$skip={measures_skip}", verify=False)

                measures = json.loads(req.text)["value"]
                measures_num = len(measures)
                total_measures += measures_num
                measures_skip += 100

                for measure in measures:
                    has_measures = True
                    total_value += float(measure['result'])

            if not has_measures:
                continue
            average_value = total_value / total_measures

            packet = {
                "result": average_value,
                "phenomenonTime": today
            }

            average_observations_url = datastream['Observations@iot.navigationLink'].replace(
                "http://localhost:8008", serverUrl)

            req = r.post(average_observations_url, json=packet, verify=False)
            print(req.status_code)
            print(req.text)
            createds += 1
    return [0] * createds


def calculate_averages_historic():
    skip = 0
    num_of_ds = 100

    createds = 0

    while num_of_ds >= 100:
        req = r.get(serverUrl + f"/FROST-Server/v1.1/Datastreams?$skip={skip}", verify=False)

        all_datastreams = json.loads(req.text)["value"]
        num_of_ds = len(all_datastreams)
        skip += num_of_ds

        print(skip, end=" ")
        for datastream in tqdm(all_datastreams):
            if "AVG_WEEKLY_" not in datastream['name']:
                continue
            print(datastream['name'])

            normal_datastream_name = datastream['name'].replace("AVG_WEEKLY_", "")
            og_datastream_res = r.get(
                f"{serverUrl}/FROST-Server/v1.1/Datastreams?$filter=name eq '{normal_datastream_name}'", verify=False)
            if og_datastream_res.status_code != 200:
                print("Error in request")
                continue
            og_datastream = json.loads(og_datastream_res.text)["value"][0]
            observations_url_base = str(og_datastream['Observations@iot.navigationLink']).replace(
                "http://localhost:8008", serverUrl)

            measureDate = datetime.datetime.now() - datetime.timedelta(days=31 * 6)

            measureDate = measureDate.replace(hour=0, minute=0, second=0, microsecond=0)

            # Fer que sigui dilluns, i que a la semana anterior hi hagin dades
            measureDate = measureDate + datetime.timedelta(days=7 - measureDate.weekday())

            while measureDate < datetime.datetime.now():
                measuresStart = measureDate - datetime.timedelta(days=7)
                observations_url = (
                        observations_url_base + f"?$filter=phenomenonTime ge {measuresStart.strftime('%Y-%m-%dT%H:%M:%SZ')}"
                        + f" and phenomenonTime lt {measureDate.strftime('%Y-%m-%dT%H:%M:%SZ')}")

                average_observations_url = (
                        str(datastream['Observations@iot.navigationLink']).replace(
                            "http://localhost:8008",
                            serverUrl) + f"?$filter=phenomenonTime ge {(measuresStart + datetime.timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')}"
                        + f" and phenomenonTime le {measureDate.strftime('%Y-%m-%dT%H:%M:%SZ')}")

                check_if_created_req = r.get(average_observations_url, verify=False)

                check_if_created_val = json.loads(check_if_created_req.text)

                if check_if_created_val['@iot.count'] != 0:
                    measureDate = measureDate + datetime.timedelta(days=7)
                    continue

                measures_skip = 0
                measures_num = 100

                total_measures = 0
                total_value = 0

                has_measures = False

                while measures_num >= 100:
                    req = r.get(observations_url + f"&$skip={measures_skip}", verify=False)

                    try:
                        measures = json.loads(req.text)["value"]
                    except json.decoder.JSONDecodeError:
                        measureDate = measureDate + datetime.timedelta(days=7)
                        continue
                    measures_num = len(measures)
                    total_measures += measures_num
                    measures_skip += 100

                    for measure in measures:
                        has_measures = True
                        try:
                            total_value += float(measure['result'])
                        except ValueError:
                            total_value += 0

                if not has_measures:
                    measureDate = measureDate + datetime.timedelta(days=7)
                    continue
                average_value = total_value / total_measures

                packet = {
                    "result": average_value,
                    "phenomenonTime": measureDate.strftime('%Y-%m-%dT%H:%M:%SZ')
                }

                average_observations_url = datastream['Observations@iot.navigationLink'].replace(
                    "http://localhost:8008", serverUrl)

                req = r.post(average_observations_url, json=packet, verify=False)
                print(req.status_code)
                createds += 1
                measureDate = measureDate + datetime.timedelta(days=7)
    return createds


def calculate_averages_historic_single_datastream(datastream_name):
    skip = 0
    num_of_ds = 100

    createds = 0

    while num_of_ds >= 100:
        req = r.get(serverUrl + f"/FROST-Server/v1.1/Datastreams?$filter=name eq '{datastream_name}'", verify=False)

        all_datastreams = json.loads(req.text)["value"]
        num_of_ds = len(all_datastreams)
        skip += num_of_ds

        print(skip, end=" ")
        for datastream in all_datastreams:
            if "AVG_WEEKLY_" not in datastream['name']:
                continue
            print(datastream['name'])

            normal_datastream_name = datastream['name'].replace("AVG_WEEKLY_", "")
            og_datastream_res = r.get(
                f"{serverUrl}/FROST-Server/v1.1/Datastreams?$filter=name eq '{normal_datastream_name}'", verify=False)
            if og_datastream_res.status_code != 200:
                print("Error in request")
                continue
            og_datastream = json.loads(og_datastream_res.text)["value"][0]
            observations_url_base = str(og_datastream['Observations@iot.navigationLink']).replace(
                "http://localhost:8008", serverUrl)

            measureDate = datetime.datetime.now() - datetime.timedelta(days=31 * 6)

            measureDate = measureDate.replace(hour=0, minute=0, second=0, microsecond=0)

            # Fer que sigui dilluns, i que a la semana anterior hi hagin dades
            measureDate = measureDate + datetime.timedelta(days=7 - measureDate.weekday())

            while measureDate < datetime.datetime.now():
                measuresStart = measureDate - datetime.timedelta(days=7)
                observations_url = (
                        observations_url_base + f"?$filter=phenomenonTime ge {measuresStart.strftime('%Y-%m-%dT%H:%M:%SZ')}"
                        + f" and phenomenonTime lt {measureDate.strftime('%Y-%m-%dT%H:%M:%SZ')}")

                average_observations_url = (
                        str(datastream['Observations@iot.navigationLink']).replace(
                            "http://localhost:8008",
                            serverUrl) + f"?$filter=phenomenonTime ge {(measuresStart + datetime.timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')}"
                        + f" and phenomenonTime le {measureDate.strftime('%Y-%m-%dT%H:%M:%SZ')}")

                check_if_created_req = r.get(average_observations_url, verify=False)

                check_if_created_val = json.loads(check_if_created_req.text)

                if check_if_created_val['@iot.count'] != 0:
                    measureDate = measureDate + datetime.timedelta(days=7)
                    # continue

                measures_skip = 0
                measures_num = 100

                total_measures = 0
                total_value = 0

                has_measures = False

                while measures_num >= 100:
                    req = r.get(observations_url + f"&$skip={measures_skip}", verify=False)

                    try:
                        measures = json.loads(req.text)["value"]
                    except json.decoder.JSONDecodeError:
                        measureDate = measureDate + datetime.timedelta(days=7)
                        continue
                    measures_num = len(measures)
                    total_measures += measures_num
                    measures_skip += 100

                    for measure in measures:
                        has_measures = True
                        try:
                            try:
                                total_value += float(measure['result'])
                            except TypeError:
                                total_value += 0
                        except ValueError:
                            total_value += 0

                if not has_measures:
                    measureDate = measureDate + datetime.timedelta(days=7)
                    continue
                average_value = total_value / total_measures

                packet = {
                    "result": average_value,
                    "phenomenonTime": measureDate.strftime('%Y-%m-%dT%H:%M:%SZ')
                }

                average_observations_url = datastream['Observations@iot.navigationLink'].replace(
                    "http://localhost:8008", serverUrl)

                req = r.post(average_observations_url, json=packet, verify=False)
                print(req.status_code)
                createds += 1
                measureDate = measureDate + datetime.timedelta(days=7)
    return createds


if __name__ in "__main__":
    calculate_averages_historic_single_datastream('AVG_WEEKLY_ENAS_10329_Water_Storage_m3')
