/*
 *  CCU.IO - AddOn script
 *
 *  Observe and post-process datapoint values
 *
 *  SG, 25.02.2015 - initial version
 *
 */

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Configuration
//

var defSettings = {
    debugLogLevel: 3,
    observe: {
        "_1": {
            source:  77107,
            target:  77003,
            trgName: "Brennstoff.Vorrat",
            func:    "cumulate",    // cumulate: trg += src * time * factor
            factor:  -0.00345       // store in hectolitre for better display in Highcharts
        },
        "_2": {
            source:  77003,
            func:    "notify",      // notify: check for min/max and send minMsg/maxMsg by mail if reached
            min:     5,
            minMsg:  {subject: "CCU.IO - Heizölbestand zu niedrig!",
                      text: "Heizölbestand ist unter die kritische Marke (5) gefallen!\n"}
        }
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Implementation
//

var settings = {};
var lastFloatVal = {};  // contains last valid float value with timestamp of datapoints

function logOutput(level, str) {
//        "1": "debug  ",
//        "2": "verbose",
//        "3": "info   ",
//        "4": "warn   ",
//        "5": "error  "
    if (level >= settings.debugLogLevel) log(str);
}

function updateFloatVal(dp, value, ts) {
    if (!lastFloatVal[dp]) lastFloatVal[dp] = {
        value: 0,
        ts: ts
    };

    // compute new valid floatVal
    var floatVal = parseFloat(value);
    if (String(value).match(/\"?(true|on|yes)\"?/)) {
        floatVal = 1;
    } else if (String(value).match(/\"?(false|off|no)\"?/)) {
        floatVal = 0;
    }
    if (!isNaN(floatVal)) {
        lastFloatVal[dp].value = floatVal;
        lastFloatVal[dp].ts = ts;
        logOutput(2, "[updateFloatVal] #" + dp + " stored value " + value + " == " + floatVal.toFixed(1) + " @timestamp " + ts);
    } else {
        logOutput(2, "[updateFloatVal] #" + dp + " skipped invalid value " + value + " @timestamp " + ts);
    }
}

function observeState(data) {
    if (!data || !data.oldState || !data.newState) return;
    logOutput(1, "[observeState] #" + data.id + " --> " + data.newState.value);

    updateFloatVal(data.id, data.oldState.value, data.oldState.lastchange);
    if (data.oldState.lastchange != data.newState.lastchange) {
        switch (this.func) {
          // TODO: add more functions

          case "notify":
            if (this.min && !this.minSent && (data.newState.value <= this.min)) {
                var msg = this.minMsg || {text: ""};
                msg.text += "\n\n" + JSON.stringify(data.newState, 0, "    ") + "\n";
                email(msg);
                // send out only once
                this.minSent = true;
                logOutput(3, "[observeState] send mail notification for #" + data.id + " = " + data.newState.value + " <= " + this.min);
            } else if (this.minSent && (data.newState.value > this.min)) {
                logOutput(2, "[observeState] #" + data.id + " reset minSent at " + data.newState.value);
                this.minSent = false;
            }
            if (this.max && !this.maxSent && (data.newState.value >= this.max)) {
                var msg = this.maxMsg || {text: ""};
                msg.text += "\n\n" + JSON.stringify(data.newState, 0, "    ") + "\n";
                email(msg);
                // send out only once
                this.maxSent = true;
                logOutput(3, "[observeState] send mail notification for #" + data.id + " = " + data.newState.value + " >= " + this.max);
            } else if (this.maxSent && (data.newState.value < this.min)) {
                logOutput(2, "[observeState] #" + data.id + " reset maxSent at " + data.newState.value);
                this.maxSent = false;
            }
            break;

          case "cumulate":
            var timeDiff = (Date.parse(data.newState.lastchange) - Date.parse(lastFloatVal[data.id].ts)) / 86400000;
            if (this.target) {
                var cumVal = lastFloatVal[data.id].value * timeDiff;
                logOutput(2, "[observeState] #" + data.id + " = " + lastFloatVal[data.id].value + " for " + (timeDiff*1440).toFixed(2) + " min --> " + cumVal);
                cumVal *= (parseFloat(this.factor) || 1);
                logOutput(2, "[observeState] add " + cumVal + " to #" + this.target);
                setState( this.target, parseFloat(getState(this.target)) + cumVal );
            }
            break;
        }
    }
}

function initPostProc() {
    // TODO: store settings in datastore, add ability to re-read settings on change
    settings = defSettings;

    if (!settings.observe) return;  // nothing to do
    for (var obs in settings.observe) {
        // create target datapoint
        if (settings.observe[obs].target) {
            setObject(settings.observe[obs].target, {
                Name: settings.observe[obs].trgName,
                TypeName: "VARDP",
                _persistent: true
            });
            logOutput(3, "[initPostProc] created datapoint #" + settings.observe[obs].target + " '" + settings.observe[obs].trgName + "'");
        }

        // subscribe to changes of source datapoint
        if (settings.observe[obs].source) {
            subscribe({
                id: settings.observe[obs].source, change: "ne"
            },
                observeState.bind( settings.observe[obs] )
            );
        }
    }
}


initPostProc();
