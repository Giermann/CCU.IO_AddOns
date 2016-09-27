/*
 *  CCU.IO - AddOn script
 *
 *  automatically open/close shutters
 *
 *  SG, 22.06.2016 - very early PRE-Version, everything hard-coded
 *  SG, 27.09.2016 - prepared suncalc-automation
 *
 */

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Configuration
//

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Implementation
//

function logOutput(level, str) {
//        "1": "debug  ",
//        "2": "verbose",
//        "3": "info   ",
//        "4": "warn   ",
//        "5": "error  "
    if (level >= 3 /*settings.debugLogLevel*/) log(str);
}

function setShutterPos(dpRead, dpWrite, pos, retries) {
    retries = (retries || 0) + 1;
    if (getState(dpRead) != pos) {
        if (retries > 5) {
            logOutput(3, "[shutterCtrl] unable to set #" + dpRead + " to pos: " + pos);
            return;
        } else {
            setState(dpWrite, pos);
            // verify in one minute (up to 5x)
            setTimeout(setShutterPos, 60000, dpRead, dpWrite, pos, retries);
        }
    } else {
        logOutput(3, "[shutterCtrl] successfully set #" + dpRead + " to pos: " + pos);
    }
}

function setDualPos(dpRead1, dpWrite1, dpRead2, dpWrite2, dpWriteDual, pos) {
    if (getState(dpRead1) == pos) {
        setShutterPos(dpRead2, dpWrite2, pos);
    } else if (getState(dpRead2) == pos) {
        setShutterPos(dpRead1, dpWrite1, pos);
    } else {
        setShutterPos(dpRead1, dpWriteDual, pos);
    }
}

function wzWestPos(pos) {
    //setShutterPos(74353, 74354, pos);
    //setShutterPos(74355, 74356, pos);
    setDualPos(74353, 74354, 74355, 74356, 74357, pos);
}
function wzNordPos(pos) {
    //setShutterPos(74358, 74359, pos);
    //setShutterPos(74360, 74361, pos);
    setDualPos(74358, 74359, 74360, 74361, 74363, pos);
}

function wzNight() {
    wzWestPos(100);
    wzNordPos(100);
}
function wzDay() {
    wzWestPos(0);
    wzNordPos(0);
}

function wzAuto() {
    // dummies
    var hour = 1, sunRise = 4, sunSet = 22;

    if (hour < sunRise) {
        todayState = 0;  // day start
    } else if (hour > sunSet) {
        if (todayState < 3) {
            wzWestPos(100);
            wzNordPos(100);
            todayState = 3; // windows closed once
        }
    } else if ((getState(77135) < 20) || // Wohnzimmertemperatur
               (getState(77103) < 23)) { // Aussentemperatur
        if (todayState < 1) {
            wzWestPos(0);
            wzNordPos(0);
            todayState = 1; // windows opened once
        }
    } else if (todayState < 2) {
        wzWestPos(40);
        if (todayState < 1) wzNordPos(0);
        todayState = 2; // sunscreen once
    }
}


function initShutterCtrl() {
    //
    // TODO: use suncalc !
    //   var suncalc = require('suncalc');
    //
//    schedule( "30 6 * * *",  wzDay );
//    schedule( "30 22 * * *", wzNight );

//    schedule( "30 * * * *", wzAuto );
}


initShutterCtrl();
