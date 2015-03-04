/*
 *  CCU.IO - AddOn script
 *
 *  Compute aggregated values per day and store them in JSON
 *
 *  SG, 24.02.2015
 *
 */

var ccuPath = "/opt/ccu.io";
var fs =        require('fs');
var settings = {};

// factor/mult only for XML export
//   factor: multiply ALL values by this
//   mult:   add second "mdiff"|"mavg"|... multiplied by this
var defSettings = {
    77001: {diff:1,                     name:"Brennerstarts"},
    77003: {min:1, diff:1, factor:100,  name:"Oelvorrat"},
    77002: {diff:1, mult:2.05,          name:"Brennerlaufzeit"},
    77004: {avg:1,                      name:"Kessel.Soll"},
    77014: {avg:1,                      name:"Brauchwasser.Soll"},
    77024: {max:1, min:1, avg:1,        name:"FB.Soll"},
    77025: {avg:1,                      name:"FB.RaumSoll"},
    77034: {max:1, min:1, avg:1,        name:"HK.Soll"},
    77035: {avg:1,                      name:"HK.RaumSoll"},
    77107: {time:1,                     name:"Brenner"},
    77108: {time:1,                     name:"FB.Pumpe"},
    77109: {time:1,                     name:"HK.Pumpe"},
    74309: {max:1, min:1, avg:1,        name:"Wohnzimmer"},
    74310: {max:1, min:1, avg:1,        name:"Aussentemperatur"},
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

    return csvArr.join("\n") + "\n";
}

function writeAggFile(callback) {
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


function processLogFile(date, data) {
    var dataArr = data.split("\n");
    var l = dataArr.length;

    if (l < 1) return;
//    var triple = dataArr[0].split(" ", 3);
//    var timestamp = new Date(triple[0] * 1000);
//    var date = timestamp.getFullYear() + '-' +
//        ("0" + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
//        ("0" + (timestamp.getDate()).toString(10)).slice(-2);

    // already processed this file
    if (settings.values[date]) return;
    
    var tmpArr = {}; // aggregated values
    var lastTS;
    for (var i = 0; i < l; i++) {
        var triple = dataArr[i].split(" ", 3);
        var floatVal = parseFloat(triple[2]);
        if (settings[triple[1]]) {
            if (!tmpArr[triple[1]]) {
                tmpArr[triple[1]] = {};
                // assume sorted values inside file, so this is the first
                tmpArr[triple[1]].firstTS = triple[0];
                tmpArr[triple[1]].ts      = triple[0];
                tmpArr[triple[1]].value   = triple[2];
            } else if (tmpArr[triple[1]].value != triple[2]) {
                var timeDiff = (parseInt(triple[0]) - parseInt(tmpArr[triple[1]].ts)) / 3600;

                if (settings[triple[1]].min || settings[triple[1]].diff) {
                    if (!tmpArr[triple[1]].min || (tmpArr[triple[1]].min > floatVal))
                        tmpArr[triple[1]].min = floatVal;
                }
                if (settings[triple[1]].max || settings[triple[1]].diff) {
                    if (!tmpArr[triple[1]].max || (tmpArr[triple[1]].max < floatVal))
                        tmpArr[triple[1]].max = floatVal;
                }

                if (settings[triple[1]].avg) {
                    tmpArr[triple[1]].avgSum  = (tmpArr[triple[1]].avgSum || 0) + floatVal * timeDiff;
                    tmpArr[triple[1]].avgTime = (tmpArr[triple[1]].avgTime || 0) + timeDiff;
                }
                if (settings[triple[1]].time) {
                    // Ausschaltvorgang, also Zeit (in h) addieren
                    if ((tmpArr[triple[1]].value >= 0) || (tmpArr[triple[1]].value == "true"))
                        if ((triple[2] == 0) || (triple[2] == "false"))
                            tmpArr[triple[1]].time = (tmpArr[triple[1]].time || 0) + timeDiff;
                }

                tmpArr[triple[1]].ts      = triple[0];
                tmpArr[triple[1]].value   = triple[2];
            }

            // assume sorted values inside file, so this is the last
            tmpArr[triple[1]].lastTS = triple[0];
            lastTS = triple[0];
        }
    }

    // now compute average, diff and store in settings.values
    for (dp in tmpArr) if (settings[dp]) {
        if (!settings.values[date]) settings.values[date] = {};
        settings.values[date][dp] = {};

        var timeDiff = (parseInt(lastTS) - parseInt(tmpArr[dp].ts)) / 3600;
        if (!tmpArr[dp].avgTime) {
            tmpArr[dp].avgSum  = parseFloat(tmpArr[dp].value);
            tmpArr[dp].avgTime = 1;
        } else {
            // add last value until end of date
            tmpArr[dp].avgSum  = tmpArr[dp].avgSum + parseFloat(tmpArr[dp].value) * timeDiff;
            tmpArr[dp].avgTime = tmpArr[dp].avgTime + timeDiff;
        }
        // still on? add time...
        if ((tmpArr[dp].value >= 0) || (tmpArr[dp].value == "true"))
            tmpArr[dp].time = (tmpArr[dp].time || 0) + timeDiff;
        tmpArr[dp].diff = tmpArr[dp].max - tmpArr[dp].min;
        tmpArr[dp].avg  = tmpArr[dp].avgSum / tmpArr[dp].avgTime;

        for (var set in settings[dp]) if ((set != "name") && (set != "factor") && (set != "mult"))
            settings.values[date][dp][set] = tmpArr[dp][set];
    }
}

function readEsyoil(date, callback) {
    // already processed this day?
    if (!settings.esyoil || !settings.values[date] || settings.values[date].esyoil) {
        if (callback) callback();
    } else {
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
            if (callback) callback();
        });
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
                processLogFile(this.file.substring(22), data.toString());
            }
            readEsyoil(this.file.substring(22), function() {
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
                if (data[i].match(/devices\-variables\.log\./))
                    files.push(data[i]);
            files.sort();
            // first read old aggregated data, then add found files
            if (files.length > 0) readAggFile( function() {
                processLogFiles(folder, files, writeAggFile);
            });
        }
    });

}


// simply skip this step in standalone mode
if (typeof schedule === 'function') {
    // Taeglich um 2 Uhr ausfuehren
    schedule("0 2 * * *", main);
}

main();
