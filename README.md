# BurpControl

BurpControl is a tool for automating security vulnerability scans with [Burp Suite Professional]


## Introduction

BurpControl, in conjunction with Burp Suite Professional, provides the following features:

* Run a Burp site crawl scan in headless or GUI mode
* Run a Burp vulnerability scan in headless or GUI mode
* Configure in and out-of-scope URL(s) for Burp's 
* Use externals UI or API tests to extend Burp's target sitemap
* Generate a scan report in HTML/XML format.
* Shut down Burp

## Prerequisites

* [Burp Suite Professional]
  A commercial web vulnerability scanner by Portswigger.
* [Burp REST API Extension]
  A Burp extensions that adds a REST API to Burp.
* [Node.js]
  Javascript runtime for BurpControl.
  
## Setup

1. Setup Burp Professional and configure a valid license
2. Build and install [Burp REST API Extension]
3. Create a configuration (JSON) for the target application.

### Running Burp with the REST API Extension

On Windows/Linux:

```sh
java -jar -Xmx2G burp-rest-api-1.0.3.jar --headless.mode=false \
--config-file=burp-default-project-options.json --user-config-file=burp-user-options.json
```

### BurpControl Configuration

```json
{
  "proxy_url": "localhost:8888",
  "api_url": "http://localhost:8090",
  "report_type": "HTLM",
  "crawl_targets": [
    "https://targetapp.herokuapp.com",
    "https://targetapp.herokuapp.com/#/docs"
  ],
  "scan_targets": [
    "https://targetapp.herokuapp.com/api"
  ],
  "targetScope": {
    "include": [ "https://targetapp.herokuapp.com" ],
    "exclude": [ "http://github.com" ]
  }
}
```

### Command-line options

```sh
  Usage: burpctl [options] [command]

  Options:

    -V, --version              output the version number
    -h, --help                 output usage information

  Commands:

    crawl [config]             Crawl using the specified configuration file
    scan [config]              Scan using the specified configuration file
    report [options] [config]  Generate a report using the specified configuration file
    start [config]             Stopping Burp using the specified configuration file
    stop [config]              Stopping Burp using the specified configuration file
    status [config]            Return the Burp status using the specified configuration file

```

### Typical workflow

1. Create a config.json file containing the URL(s) of the target application.

2. Start up Burp with the API Extension
```sh
burpctl start
```
3. Crawl the application by running
```sh
burpctl crawl
```
4. Optionally run UI tests (e.g., pupeteer test using Burp as a proxy).

5. Actively scan the application by running
```sh
burpctl scan
```
6. Generate a report with
```sh
burpctl report
```


[Burp Suite Professional]: https://portswigger.net/burp
[Burp REST API Extension]: https://github.com/vmware/burp-rest-api
[Node.js]: https://nodejs.org/en/
[Jenkins]: https://jenkins.io/


