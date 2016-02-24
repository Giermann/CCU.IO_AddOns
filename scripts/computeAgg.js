/*
 *  CCU.IO - AddOn script
 *
 *  Compute aggregated values per day and store them in JSON
 *
 *  SG, 24.02.2015 - initial version
 *  SG, 23.02.2016 - completely reworked average computing, read date from timestamp instead of filename
 *
 */

// include debug output and do not save changes
var debugRun = 0;

var ccuPath = "/opt/ccu.io";
var fs =        require('fs');
var settings = {};

var tmpArr = {}; // aggregated values for 1 day
var newFoundDays = [];
var lastDay = null;


// factor/mult only for XML export
//   factor: multiply ALL values by this
//   mult:   add second "mdiff"|"mavg"|... multiplied by this
var defSettings = {
    77003: {min:1, diff:1, factor:100,  name:"Oelvorrat"},
    77107: {avg:1, mult:0.3545,         name:"Brennermodulation"},
    77135: {max:1, min:1, avg:1,        name:"Wohnzimmer"},
    77103: {max:1, min:1, avg:1,        name:"Aussentemperatur"},
    74311: {diff:1, factor:0.0005,      name:"Stromverbrauch"},
    77126: {diff:1,                     name:"Solarertrag"},
    77108: {max:1, min:1,               name:"Wasserdruck"},
    77109: {diff:1,                     name:"Zuendfehler 1"},
    77110: {diff:1,                     name:"Zuendfehler 2"},
    77148: {diff:1,                     name:"Zuendausfall"},
    esyoil: {zip:31079, amount:[77003, "min", 4000]} // amount = [datapoint, set, max_content] --> max - dp[set]
};

var http =      require('http'),
    https =     require('https');

function getURL(url, callback) {
    if (!url) return;
    if (url.match(/^https/)) {
        https.get(url, function(res) {
            var body = "";
            res.on("data", function (data) { body += data; });
            res.on("end", function () { callback(body); });
        }).on('error', function(e) {});
    } else {
        http.get(url, function(res) {
            var body = "";
            res.on("data", function (data) { body += data; });
            res.on("end", function () { callback(body); });
        }).on('error', function(e) {});
    }
}

// callback(cost, amount, date)
function getPrice(zip, amount, year, month, day, callback) {
    var date = new Date(year, month-1, day-2); // -2 days to get the requested last (returns 5 prices from -2 to +2 days)
    var url = "https://www.esyoil.com/s46_hisrechner.php?calculate=Rechnen&s46_plz="+zip+"&s46_menge="+amount+"&s46_es=1&s46_jahr="+date.getFullYear()+"&s46_monat="+(date.getMonth()+1)+"&s46_tag="+date.getDate();

    getURL(url, function(res) {
        var str, cost, esyDate;

        // globally find all occurences first
        str = res.match(/class="price last".*>(.*)</g);
        // if found, read value from the last (premium product)
        if (str && (str.length > 0))
            str = str[str.length-1].match(/class="price last".*>(.*)</); // now find value inside ()
        // convert decimal comma to point and parse value
        cost = (str && (str.length > 1) ? parseFloat(str[1].replace(/,/, '.')) : null);

        //var dat = /class="date last".*?>(.*?)</.exec(res);
        esyDate = res.match(/class="date last".*?>(.*?)</);

        if (callback)
            callback(cost, amount, (esyDate && (esyDate.length>1) ? esyDate[1] : null));
    });
}


function readAggFile(callback) {
// SG, 23.02.2016 - add ability to debug
    if (debugRun == 1) { settings = defSettings; } else
    try {
        var storedValues = fs.readFileSync(ccuPath+"/datastore/average-variables.json");
        settings = JSON.parse(storedValues.toString());
    } catch (e) {
        console.log("ERROR reading stored values.\n"+JSON.stringify(e));
        settings = defSettings;
    }
    if (!settings.values) settings.values = {};
    if (callback) callback();
}

function makeCSV() {
    var csvArr = [], csvLine = "";

    // Header line
    csvLine = csvLine + '"Date";';
    for (var dp in settings) if ((dp != "values") && (dp != "esyoil"))
        for (var set in settings[dp]) if ((set != "name") && (set != "factor") && (set != "mult")) {
            csvLine = csvLine + '"'+(settings[dp].name || dp)+'['+set+']";';
            if (settings[dp].mult)
                csvLine = csvLine + '"'+(settings[dp].name || dp)+'[m'+set+']";';
        }
    if (settings.esyoil)
        csvLine = csvLine + '"esyoil[cost]";"esyoil[amount]";"esyoil[sum]";"esyoil[date]";';

    csvArr.push(csvLine);
    if (settings.values) for (var day in settings.values) {
        csvLine = '"'+day+'";';
        for (var dp in settings) if ((dp != "values") && (dp != "esyoil"))
            for (var set in settings[dp]) if ((set != "name") && (set != "factor") && (set != "mult")) {
                if (!settings.values[day][dp] || !settings.values[day][dp][set]) {
                    csvLine = csvLine + ';';
                } else if (settings[dp].factor) {
                    csvLine = csvLine + '"'+(settings.values[day][dp][set] * settings[dp].factor)+'";';
                } else {
                    csvLine = csvLine + '"'+settings.values[day][dp][set]+'";';
                }
                if (settings[dp].mult) {
                    if (!settings.values[day][dp] || !settings.values[day][dp][set]) {
                        csvLine = csvLine + ';';
                    } else {
                        csvLine = csvLine + '"'+(settings.values[day][dp][set] * settings[dp].mult)+'";';
                    }
                }
            }
        if (settings.esyoil) {
            if (!settings.values[day].esyoil || !settings.values[day].esyoil.cost) {
                csvLine = csvLine + ';';
            } else {
                csvLine = csvLine + '"'+settings.values[day].esyoil.cost+'";';
            }
            if (!settings.values[day].esyoil || !settings.values[day].esyoil.amount) {
                csvLine = csvLine + ';';
            } else {
                csvLine = csvLine + '"'+settings.values[day].esyoil.amount+'";';
            }
            if (!settings.values[day].esyoil || !settings.values[day].esyoil.sum) {
                csvLine = csvLine + ';';
            } else {
                csvLine = csvLine + '"'+settings.values[day].esyoil.sum+'";';
            }
        }
        csvLine = csvLine.replace(/\./g, ',');
        if (settings.esyoil) {
            if (!settings.values[day].esyoil || !settings.values[day].esyoil.date) {
                csvLine = csvLine + ';';
            } else {
                csvLine = csvLine + '"'+settings.values[day].esyoil.date+'";';
            }
        }
        csvArr.push(csvLine);
    }
    // TODO: is order always retained?
    //csvArr.sort();

    return csvArr.join("\n") + "\n";
}

function writeAggFile(callback) {
// SG, 23.02.2016 - add ability to debug run
    if (debugRun == 1) {
        console.log("--\n" + JSON.stringify(settings, null, "  ") + "--\n" + makeCSV());
        return;
    }
    // skip last day, because it's neither finished nor calculated yet
    if (lastDay != null) delete settings.values[lastDay];
    var str = JSON.stringify(settings);

    // add some newline and spaces
    str = str.replace(/("values":)/g, '\n$1');
    str = str.replace(/("esyoil":)/g, '\n    $1');
    str = str.replace(/("[0-9]*":)/g, '\n    $1');
    str = str.replace(/("[0-9][0-9][0-9][0-9]-[-0-9]*":)/g, '\n  $1');
    str = str.replace(/}}}}/g, '}}\n}}\n');

    try {
        console.log("Writing settings back to "+ccuPath+"/datastore/average-variables.json");
        fs.writeFileSync(ccuPath+"/datastore/average-variables.json", str);
    } catch (e) {
        console.log("ERROR writing stored values!\n"+JSON.stringify(e));
    }
    try {
        console.log("Writing settings back to "+ccuPath+"/www/average.csv");
        fs.writeFileSync(ccuPath+"/www/average.csv", makeCSV());
    } catch (e) {
        console.log("ERROR writing CSV values!\n"+JSON.stringify(e));
    }
    if (callback) callback();
}


function date2String(timestamp) {
    return timestamp.getFullYear() + '-' +
        ("0" + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
        ("0" + (timestamp.getDate()).toString(10)).slice(-2);
}

function initTmpArr(dp, timestamp, value, floatVal) {
    tmpArr[dp] = {};
    tmpArr[dp].ts        = timestamp;
    tmpArr[dp].lastValue = value;
    if (floatVal) {
        tmpArr[dp].lastFloat = floatVal;
    } else {
        if (String(value).match(/\"?(true|on|yes)\"?/)) {
            tmpArr[dp].lastFloat = 1;
        } else {
            floatVal = parseFloat(value);
            tmpArr[dp].lastFloat = isNaN(floatVal) ? 0 : floatVal;
        }
    }
    // assure valid min/max
    tmpArr[dp].min = tmpArr[dp].lastFloat;
    tmpArr[dp].max = tmpArr[dp].lastFloat;
}

function updateTmpArr(dp, timestamp, value) {
    var timeDiff = (parseInt(timestamp) - parseInt(tmpArr[dp].ts)) / 86400;

    tmpArr[dp].ts        = timestamp;
    tmpArr[dp].lastValue = value;

    // add time if it was "on" until now
    if (tmpArr[dp].lastFloat > 0)
        tmpArr[dp].time = (tmpArr[dp].time || 0) + timeDiff;

    tmpArr[dp].avg  = (tmpArr[dp].avg || 0) + (tmpArr[dp].lastFloat * timeDiff);

    // compute new valid floatVal
    if (String(value).match(/\"?(true|on|yes)\"?/)) {
        tmpArr[dp].lastFloat = 1;
    } else {
        floatVal = parseFloat(value);
        if (!isNaN(floatVal)) tmpArr[dp].lastFloat = floatVal;
    }

    if (tmpArr[dp].min > tmpArr[dp].lastFloat) tmpArr[dp].min = tmpArr[dp].lastFloat;
    if (tmpArr[dp].max < tmpArr[dp].lastFloat) tmpArr[dp].max = tmpArr[dp].lastFloat;

//if ((debugRun == 1) && settings[triple[1]].avg) console.log(lastValue.toFixed(1) + " for " + (timeDiff*1440).toFixed(2) + " min = " + (lastValue * timeDiff).toFixed(3) + "  ==>  " + tmpArr[triple[1]].avg.toFixed(3) + " @" + (new Date(triple[0] * 1000)));

}

function processLogFile(data) {
    var dataArr = data.split("\n");
    while (dataArr[0] == "") dataArr.shift();
    var l = dataArr.length;

    while ((l > 0) && (dataArr[l-1] == "")) l--;
    if (l < 1) return;

    // skip whole file if day of first and last line already processed
    if (settings.values[date2String(new Date(dataArr[0].split(" ", 3)[0] * 1000))] &&
        settings.values[date2String(new Date(dataArr[l-1].split(" ", 3)[0] * 1000))]) return;

    for (var i = 0; i < l; i++) {
        var triple = dataArr[i].split(" ", 3);
        if ((dataArr[i] == "") || isNaN(parseInt(triple[0]))) continue;

        // extract day from timestamp
        var timestamp = new Date(triple[0] * 1000);
        var date = date2String(timestamp);

        // skip invalid dates
        if ((timestamp.getFullYear() < 2000) || (timestamp > new Date())) {
            continue;
        }
        if (lastDay == null) lastDay = date;

        // skip if day already processed
        if (settings.values[date]) {
            lastDay = date;
            continue;
        }

        // start a new day: now compute average, diff and store in settings.values
        if (lastDay != date) {
            var ts = (new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate())).getTime() / 1000;
            if (!settings.values[lastDay]) settings.values[lastDay] = {};

            for (dp in tmpArr) if (settings[dp] && !settings.values[lastDay][dp]) {
                // avoid init, if lastDay was set by skipping a date
                settings.values[lastDay][dp] = {};

                // one last update for avg and time
                updateTmpArr(dp, ts, tmpArr[dp].lastValue);
                tmpArr[dp].diff = tmpArr[dp].max - tmpArr[dp].min;

                for (var set in settings[dp]) if ((set != "name") && (set != "factor") && (set != "mult"))
                    settings.values[lastDay][dp][set] = tmpArr[dp][set] || 0;

                settings.values[lastDay][dp].val = tmpArr[dp].lastValue;
                settings.values[lastDay][dp].flt = tmpArr[dp].lastFloat;
            }

            // store values of last day in tmpArr, even when processed earlier
            for (dp in settings.values[lastDay]) if (settings[dp])
                initTmpArr(dp, ts, settings.values[lastDay][dp].val, settings.values[lastDay][dp].flt);

            // add this day for readEsyoil
            if (newFoundDays.indexOf(lastDay) < 0) newFoundDays.push(lastDay);

            lastDay = date;
        }
        
        // store current value in tmpArr
        if (settings[triple[1]]) {
            if (!tmpArr[triple[1]]) {
                // assume sorted values inside file, so this is the first
                initTmpArr(triple[1], triple[0], triple[2]);
            } else if (tmpArr[triple[1]].lastValue != triple[2]) {
                updateTmpArr(triple[1], triple[0], triple[2]);
            }
        }
    }
}

function readEsyoil(callback) {
    if (newFoundDays.length < 1) {
        if (callback) callback();
        return;
    }

    var date = newFoundDays.pop();
    // already processed this day?
    if (settings.esyoil && settings.values[date] && !settings.values[date].esyoil) {
        var year = date.substr(0,4), month = date.substr(5,2), day = date.substr(8,2), amount;

        // calc amount
        if (settings.esyoil.amount && settings.esyoil.amount.length > 2) {
            // settings.esyoil.amount[0] = datapoint
            // settings.esyoil.amount[1] = set
            // settings.esyoil.amount[2] = max
            var dpValues = settings.values[date][settings.esyoil.amount[0]];
            if (dpValues) amount =
                settings.esyoil.amount[2] -
                dpValues[settings.esyoil.amount[1]] *
                (settings[settings.esyoil.amount[0]].factor || 1);
        }
        if (!amount) amount = 3000;
        getPrice(settings.esyoil.zip || 31079, amount.toFixed(0), year, month, day, function(cost, amount, esyDate) {
//            console.log("done: " + cost.toFixed(2) + " EUR/100l = " +
//                (cost*amount/100).toFixed(2) + " EUR/" + amount + "l (Stand: " + esyDate + " / " + date + ")");
            settings.values[date].esyoil = {
                cost:   cost.toFixed(2),
                amount: amount,
                sum:    (cost*amount/100).toFixed(2),
                date:   esyDate
            };
            // next day
            readEsyoil(callback);
        });
    } else {
        readEsyoil(callback);
    }
}

function processLogFiles(folder, files, callback) {
    var path = files.shift();
    if (path) {
        fs.readFile(folder + path, function (err, data) {
            if (err) {
                console.log(JSON.stringify(err));
            } else {
                console.log(this.fold + this.file + "...");
                processLogFile(data.toString());
            }
            readEsyoil(function() {
                processLogFiles(this.fold, this.remain, this.call);
            }.bind(this));
        }.bind({ file: path, remain: files, fold: folder, call: callback }));
    } else {
        callback();
    }
}

function main() {
    var folder = ccuPath+"/log/";
    var files = [];

    // cycle through log folder
    fs.readdir(folder, function (err, data) {
        if (err) {
            console.log("Unable to read dir: "+folder);
        } else {
            for (var i = 0; i < data.length; i++)
                if (data[i].match(/devices\-variables\.log\.201(5\-1[1|2]|6\-)/))
//                if (data[i].match(/devices\-variables\.log\.2016\-02\-2/))
//                if (data[i].match(/devices\-variables\.log\./))
                    files.push(data[i]);
            files.sort();
            files.push("devices-variables.log");

            // first read old aggregated data, then add found files
            if (files.length > 0) readAggFile( function() {
                processLogFiles(folder, files, writeAggFile);
            });
        }
    });

}


// simply skip this step in standalone mode
if (typeof schedule === 'function') {
    debugRun = 0;
    // run daily at 2:00 am
    schedule("0 2 * * *", main);
}

main();
