import datetime
import glob
import json
import logging
import sys
import threading
import time
import traceback

import requests as r
import tqdm

platform_url = "http://acquaount-platform:80"

print(len(sys.argv))

if len(sys.argv) >= 2:
    if sys.argv[1] == "historic" or sys.argv[1] == "upload":
        platform_url = "http://172.20.49.81"
        # platform_url = "http://acquaount-platform:80"

import zentracloud
import fieldclimate
import iradata
import vanwalt
import elard
import averageCalculator
import enas

filelock = threading.Lock()

def dateformat_log(date):
    hour = "{:0>{}}".format(date.hour, 2)
    minute = "{:0>{}}".format(date.minute, 2)
    second = "{:0>{}}".format(round(date.second, 2), 2)
    return f"{date.day}/{date.month}/{date.year} {hour}:{minute}:{second}"


def log(message="", level=logging.INFO):
    lg = logging.getLogger("acquaount")
    # lg.log(level, dateformat_log(datetime.datetime.now()) + "|\t" + str(message))
    # with open('logs/log.txt', 'a+') as f:
    #    f.write(dateformat_log(datetime.datetime.now()) + "|\t" + str(message) + "\n")
    print(dateformat_log(datetime.datetime.now()) + "|\t" + str(message))


def send_timeseries_data(data, thing_name):
    url = platform_url + f"/{thing_name.lower()}/actions/receiveMeasure"
    for packet in data:
        if "device_id" in packet["info"]:
            packet["info"]["deviceID"] = packet["info"]["device_id"]
            del packet["info"]["device_id"]
        res = r.post(url, data=json.dumps(packet), verify=False)
        resp = json.loads(res.text)
        if res.status_code != 200 or not resp["result"]:
            print(res.status_code, res.text)
            log(f"{thing_name}|\tUpload failed! {packet}")
            raise Exception(res.text)
    log(f"{thing_name}|\tUpload completed!")


def save_json_file(data, thing_name):
    with filelock:
        with open(f'dades/{thing_name}.json', 'w+') as f:
            f.write("[")
            for packet in tqdm.tqdm(data):
                f.write(json.dumps(packet))
                if packet != data[-1]:
                    f.write(",")
            f.write("]")


def create_job(job_name, obtain_data_function, send_data_function, thing_name, is_ftp=False):
    global active_threads, semaphore, ftplock

    def job():
        try:
            log(f"{job_name}|\tStarting job!")
            data = obtain_data_function()
            log(f"{job_name}|\tDetected {len(data)} measures!")
            if send_data_function is not None:
                send_data_function(data, thing_name)
            log(f"{job_name}|\tSuccessfully completed job!")
            log(f"{job_name}|\tReleasing semaphore!")
            semaphore.release()
            log(f"{job_name}|\tLock released!")
        except Exception as ex:
            log(f"{job_name}|\tJob failed! {traceback.format_exc()}")
            log(f"{job_name}|\tReleasing lock from error!")
            semaphore.release()
            if is_ftp and ftplock.locked():
                ftplock.release()
            log(f"{job_name}|\tLock released from error!")

    def tjob():
        global active_threads, semaphore
        log(f"{job_name}|\tAcquiring semaphore!")
        semaphore.acquire()
        t = threading.Thread(target=job)
        log(f"{job_name}|Starting thread!")
        t.start()
        active_threads.append(t)
        join_threads()
        return t

    return tjob


def getDataMock():
    return [
        {
            "info": {
                "deviceID": "DX001",
                "timestamp": "2023-10-18T05:29:00Z"
            },
            "values": {
                "air_temperature": "25"
            }
        },
        {
            "info": {
                "deviceID": "DX001",
                "timestamp": "2023-10-19T05:29:00Z"
            },
            "values": {
                "air_temperature": "30"
            }
        }
    ]


def join_threads():
    global active_threads
    to_remove = []
    log(f"{len(active_threads)}")
    for thread in active_threads:
        if not thread.is_alive():
            log(f"Joining one thread!")
            thread.join()
            log(f"Thread joined successfully!")
            to_remove.append(thread)
    for thread in to_remove:
        active_threads.remove(thread)


if __name__ in "__main__":
    active_threads = []
    semaphore = threading.Semaphore(6)
    ftplock = threading.Lock()

    # schedule.every(10).minutes.do(join_threads)
    print(len(sys.argv))
    if len(sys.argv) >= 2:
        if sys.argv[1] == "historic":
            zentra_historic_1 = create_job("ZentraHistoric1",
                                           zentracloud.get_historic_function('z6-19947', jobName="ZentraHistoric1"),
                                           save_json_file,
                                           "AcquaountJordanDA")
            zentra_historic_2 = create_job("ZentraHistoric2",
                                           zentracloud.get_historic_function('z6-19948', jobName="ZentraHistoric2"),
                                           save_json_file,
                                           "AcquaountJordanKS")
            # zentra_historic_1()
            # zentra_historic_2()

            fieldclimate_stations = [
                "000008D6",
                "000008DD",
                "000008E0",
                "000008E4",
                "000008E5",
                "000008F7",
                "000010CC",
                "00001896",
                "000025BD",
                "00204B21",
                "00204EA1",
                "00204EB1"
            ]
            for station in fieldclimate_stations:
                # station_historic = create_job(f"FieldClimate{station}",fieldclimate.get_historic_function(station),save_json_file,f"AcquaountLebanon{station}")
                # station_historic()
                pass

            with open("iradata_specification.json", "r") as f:
                iradata_info = json.loads(f.read())
                for info in iradata_info:
                    station_historic = create_job(f"IraData{info['name']}",
                                                  iradata.get_historic_function(info),
                                                  save_json_file,
                                                  info['title'])
                    # station_historic()

            vanwalt_things = [
                "Well_178_Santa_Giusta",
                "Well_N10_Arborea",
                "Well_N8_Arborea"
            ]
            for thing in vanwalt_things:
                thing_historic = create_job(f"VanWalt{thing}",
                                            vanwalt.get_historic_function(thing, ftplock=ftplock),
                                            save_json_file,
                                            f"AcquaountTirsoAquifer")
                # thing_historic()

            elard_things = [
                "SaraainBaalbeck",
                "SaaidehBaalbeck",
                "HaouchElSaaloukWestBekaa"
            ]
            elard_devices = [
                "36231669",
                "36231670",
                "36231677"
            ]
            for i, thing in enumerate(elard_things):
                thing_historic = create_job(f"Elard{thing}",
                                            elard.get_historic_function(elard_devices[i], ftplock=ftplock),
                                            save_json_file,
                                            f"Acquaount{thing}")
                # thing_historic()

            enas_things = ['1067',
                           '10329',
                           '40000',
                           '50065']
            for thing in enas_things:
                thing_historic = create_job(f"ENAS{thing}",
                                            enas.get_historic_function2(thing),
                                            save_json_file,
                                            f"AcquaountENAS")
                # thing_historic()
        elif sys.argv[1] == "upload":
            import urllib3

            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            skip_names = []
            start_measure = 92541 + 61230 + 2604 + 136672 + 10935 + 98054 + 1791 + 8918 + 217857 + 35551

            up_files = list(glob.glob("dades/*"))
            up_files.sort()
            first = True
            for file in up_files:
                print(file)
                # UBUNTU
                # thingName = file.split(".")[0].split("/")[1]
                # WINDOWS
                thingName = file.split(".")[0].split("\\")[1]
                if thingName in skip_names:
                    continue
                with open(file, 'r') as f:
                    data = json.loads(f.read())
                    print(f"{thingName}: {len(data)} measures")
                    if first:
                        first = False
                        data = data[start_measure:]
                    send_timeseries_data(data, thingName)
    else:
        print(glob.glob("/modelData/*"))

        daily_jobs = []
        weekly_jobs = []
        three_hour_jobs = []
        print("Creating all the jobs")
        zentra1 = create_job("Zentra1", zentracloud.get_function('z6-19947'), send_timeseries_data, "AcquaountJordanDA")
        zentra2 = create_job("Zentra2", zentracloud.get_function('z6-19948'), send_timeseries_data, "AcquaountJordanKS")

        daily_jobs.append(zentra1)
        daily_jobs.append(zentra2)

        fieldclimate_stations = [
            "000008D6",
            "000008DD",
            "000008E0",
            "000008E4",
            "000008E5",
            "000008F7",
            "000010CC",
            "00001896",
            "000025BD",
            "00204B21",
            "00204EA1",
            "00204EB1"
        ]
        for station in fieldclimate_stations:
            station_job = create_job(f"FieldClimate{station}",fieldclimate.get_function(station),send_timeseries_data,f"AcquaountLebanon{station}")
            daily_jobs.append(station_job)

        with open("iradata_specification.json", "r") as f:
            iradata_info = json.loads(f.read())
            for info in iradata_info:
                station_job = create_job(f"IraData{info['name']}", iradata.get_function(info), send_timeseries_data,
                                         info['title'])
                daily_jobs.append(station_job)

        vanwalt_things = [
            "Well_178_Santa_Giusta_NEW_000090",
            "Well_N10_Arborea",
            "Well_N8_Arborea"
        ]
        for thing in vanwalt_things:
            thing_job = create_job(f"VanWalt{thing}", vanwalt.get_function(thing, ftplock=ftplock),
                                   send_timeseries_data,
                                   f"AcquaountTirsoAquifer", is_ftp=True)
            daily_jobs.append(thing_job)

        elard_things = [
            "SaraainBaalbeck",
            "SaaidehBaalbeck",
            "HaouchElSaaloukWestBekaa"
        ]
        elard_devices = [
            "36231669",
            "36231670",
            "36231677"
        ]
        for i, thing in enumerate(elard_things):
            thing_job = create_job(f"Elard{thing}",
                                   elard.get_function(elard_devices[i], ftplock=ftplock),
                                   send_timeseries_data,
                                   f"Acquaount{thing}", is_ftp=True)
            three_hour_jobs.append(thing_job)
        elard_job = create_job(f"Elard36231672",
                               elard.get_function("36231672", ftplock=ftplock),
                               send_timeseries_data,
                               f"AcquaountYammounehLake", is_ftp=True)
        three_hour_jobs.append(elard_job)

        enas_things = ['1067',
                       '10329',
                       '40000',
                       '50065']
        for i, thing in enumerate(enas_things):
            thing_job = create_job(f"ENAS{thing}",
                                   enas.get_function(thing, ftplock=ftplock),
                                   send_timeseries_data,
                                   f"AcquaountCantonieraReservoir", is_ftp=True)
            daily_jobs.append(thing_job)

        averages_job = create_job("CreateAverages",
                                  averageCalculator.calculate_averages,
                                  None,
                                  "Averages")
        weekly_jobs.append(averages_job)

        while True:
            print("Running pending")
            hour_of_day = datetime.datetime.now().hour
            weekday = datetime.datetime.now().weekday()

            if hour_of_day == 0:
                if weekday == 0:
                    for job in weekly_jobs:
                        job()
                        join_threads()
                for job in daily_jobs:
                    job()
                    join_threads()
                for job in three_hour_jobs:
                    job()
                    join_threads()
            elif hour_of_day in [3, 6, 9, 12, 15, 18, 21]:
                for job in three_hour_jobs:
                    job()
                    join_threads()
            for _ in range(6):
                time.sleep(600)
                join_threads()
