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

import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

platform_url = "http://acquaount-platform:80"

import averageCalculator

filelock = threading.Lock()


def dateformat_log(date):
    hour = "{:0>{}}".format(date.hour, 2)
    minute = "{:0>{}}".format(date.minute, 2)
    second = "{:0>{}}".format(round(date.second, 2), 2)
    return f"{date.day}/{date.month}/{date.year} {hour}:{minute}:{second}"


def log(message="", level=logging.INFO):
    lg = logging.getLogger("acquaount")
    print(dateformat_log(datetime.datetime.now()) + "|\t" + str(message))


def send_timeseries_data(data, thing_url):
    url = platform_url + f"/{thing_url.lower()}/actions/receiveMeasure"
    for packet in data:
        if "device_id" in packet["info"]:
            packet["info"]["deviceID"] = packet["info"]["device_id"]
            del packet["info"]["device_id"]
        res = r.post(url, data=json.dumps(packet), verify=False)
        resp = json.loads(res.text)
        if res.status_code != 200 or not resp["result"]:
            print(res.status_code, res.text)
            log(f"{thing_url}|\tUpload failed! {packet}")
            raise Exception(res.text)
    log(f"{thing_url}|\tUpload completed!")


def save_json_file(data, thing_url):
    with filelock:
        with open(f'data/{thing_url}.json', 'w+') as f:
            f.write("[")
            for packet in tqdm.tqdm(data):
                f.write(json.dumps(packet))
                if packet != data[-1]:
                    f.write(",")
            f.write("]")


def create_job(job_name, obtain_data_function, send_data_function, thing_url, is_ftp=False):
    global active_threads, semaphore, ftplock

    def job():
        try:
            log(f"{job_name}|\tStarting job!")
            data = obtain_data_function()
            log(f"{job_name}|\tDetected {len(data)} measures!")
            if send_data_function is not None:
                send_data_function(data, thing_url)
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

    print(len(sys.argv))
    if len(sys.argv) >= 2:
        if sys.argv[1] == "historic":
            pass
            # CONFIGURE HISTORIC JOBS HERE
        elif sys.argv[1] == "upload":
            skip_names = []
            start_measure = 0

            up_files = list(glob.glob("/data/*"))
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
        daily_jobs = []
        weekly_jobs = []
        three_hour_jobs = []
        print("Creating all the jobs")

        # CONFIGURE JOBS HERE

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
