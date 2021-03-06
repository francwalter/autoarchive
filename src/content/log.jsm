// Opera Wang, 2010/1/15
// GPL V3 / MPL
// debug utils
"use strict";
const { classes: Cc, Constructor: CC, interfaces: Ci, utils: Cu, results: Cr, manager: Cm, stack: Cs } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm"); // import toXPCOMArray
const popupImage = "chrome://awsomeAutoArchive/content/icon_popup.png";
var EXPORTED_SYMBOLS = ["autoArchiveLog"];
let autoArchiveLog = {
  oldAPI: Services.vc.compare(Services.appinfo.platformVersion, '22') < 0,
  popupDelay: Services.prefs.getIntPref("alerts.totalOpenTime") / 1000,
  setPopupDelay: function(delay) {
    this.popupDelay = delay;
  },
  popupListener: {
    QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIObserver]), // not needed, just be safe
    observe: function(subject, topic, cookie) {
      if ( topic == 'alertclickcallback' ) { // or alertfinished / alertshow(Gecko22)
        let type = 'global:console';
        let logWindow = Services.wm.getMostRecentWindow(type);
        if ( logWindow ) return logWindow.focus();
        Services.ww.openWindow(null, 'chrome://global/content/console.xul', type, 'chrome,titlebar,toolbar,centerscreen,resizable,dialog=yes', null);
      } else if ( topic == 'alertfinished' ) {
        delete popupWins[cookie];
      }
    }
  },
  popup: function(title, msg) {
    let delay = this.popupDelay;
    if ( delay <= 0 ) return;
    /*
    http://mdn.beonex.com/en/Working_with_windows_in_chrome_code.html 
    https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIAlertsService
    https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Alerts_and_Notifications
    Before Gecko 22, alert-service won't work with bb4win, use xul instead
    https://bugzilla.mozilla.org/show_bug.cgi?id=782211
    From Gecko 22, nsIAlertsService also use XUL on all platforms and easy to pass args, but difficult to get windows, so hard to change display time
    let alertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
    alertsService.showAlertNotification(popupImage, title, msg, true, cookie, this.popupListener, name);
    */
    let cookie = Date.now();
    let args = [popupImage, title, msg, true, cookie, 0, '', '', null, this.popupListener];
    if ( this.oldAPI ) args.splice(6,3); // remove '', '', null
    // win is nsIDOMJSWindow, nsIDOMWindow
    let win = Services.ww.openWindow(null, 'chrome://global/content/alerts/alert.xul', "_blank", 'chrome,titlebar=no,popup=yes',
      // https://alexvincent.us/blog/?p=451
      // https://groups.google.com/forum/#!topic/mozilla.dev.tech.js-engine/NLDZFQJV1dU
      toXPCOMArray(args.map( function(arg) {
        let variant = Cc["@mozilla.org/variant;1"].createInstance(Ci.nsIWritableVariant);
        if ( arg && typeof(arg) == 'object' ) variant.setAsInterface(Ci.nsIObserver, arg); // to pass the listener interface
        else variant.setFromVariant(arg);
        return variant;
      } ), Ci.nsIMutableArray));
    popupWins[cookie] = Cu.getWeakReference(win);
    // sometimes it's too late to set win.arguments here when the xul window is reused.
    // win.arguments = args;
    let popupLoad = function() {
      win.removeEventListener('load', popupLoad, false);
      if ( win.document ) {
        let alertBox = win.document.getElementById('alertBox');
        if ( alertBox ) alertBox.style.animationDuration = delay + "s";
        let text = win.document.getElementById('alertTextLabel');
        if ( text && win.arguments[3] ) text.classList.add('awsome_auto_archive-popup-clickable');
      }
      win.moveWindowToEnd = function() { // work around https://bugzilla.mozilla.org/show_bug.cgi?id=324570,  Make simultaneous notifications from alerts service work
        let x = win.screen.availLeft + win.screen.availWidth - win.outerWidth;
        let y = win.screen.availTop + win.screen.availHeight - win.outerHeight;
        let windows = Services.wm.getEnumerator('alert:alert');
        while (windows.hasMoreElements()) {
          let alertWindow = windows.getNext();
          if (alertWindow != win && alertWindow.screenY > win.outerHeight) y = Math.min(y, alertWindow.screenY - win.outerHeight);
        }
        let WINDOW_MARGIN = 10; y += -WINDOW_MARGIN; x += -WINDOW_MARGIN;
        win.moveTo(x, y);
      }
    };
    if ( win.document.readyState == "complete" ) popupLoad();
    else win.addEventListener('load', popupLoad, false);
  },
  cleanup: function() {
    try {
      this.info("Log cleanup");
      for ( let cookie in popupWins ) {
        let newwin = popupWins[cookie].get();
        this.info("close alert window:" + cookie);
        if ( newwin && newwin.document && !newwin.closed ) newwin.close();
      };
      popupWins = {};
      this.info("Log cleanup done");
    } catch(err){}
  },
  
  now: function() { //author: meizz
    let format = "yyyy-MM-dd hh:mm:ss.SSS ";
    let time = new Date();
    let o = {
      "M+" : time.getMonth()+1, //month
      "d+" : time.getDate(),    //day
      "h+" : time.getHours(),   //hour
      "m+" : time.getMinutes(), //minute
      "s+" : time.getSeconds(), //second
      "q+" : Math.floor((time.getMonth()+3)/3),  //quarter
      "S+" : time.getMilliseconds() //millisecond
    }
    
    if(/(y+)/.test(format)) format=format.replace(RegExp.$1,
      (time.getFullYear()+"").substr(4 - RegExp.$1.length));
    for(let k in o)if(new RegExp("("+ k +")").test(format))
      format = format.replace(RegExp.$1,
        RegExp.$1.length==1 ? o[k] :
          ("000"+ o[k]).substr((""+ o[k]).length+3-RegExp.$1.length));
    return format;
  },
  
  verbose: false,
  setVerbose: function(verbose) {
    this.verbose = verbose;
  },

  info: function(msg,popup,force) {
    if (!force && !this.verbose) return;
    this.log(this.now() + msg,popup,true);
  },

  log: function(msg,popup,info) {
    if ( ( typeof(info) != 'undefined' && info ) || !Components || !Cs || !Cs.caller ) {
      Services.console.logStringMessage(msg);
    } else {
      let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
      scriptError.init(msg, Cs.caller.filename, Cs.caller.sourceLine, Cs.caller.lineNumber, 0, scriptError.warningFlag, "chrome javascript");
      Services.console.logMessage(scriptError);
    }
    if (popup) {
      if ( typeof(popup) != 'string' ) popup = 'Warning!';
      this.popup(popup,msg);
    }
  },
  
  // from errorUtils.js
  dumpValue: function(value, i, recurse, compress, pfx, tee, level, map) {
    let t = "", s= "";
    try { t = typeof(value); }
    catch (err) { s += pfx + tee + " (exception) " + err + "\n"; }
    switch (t) {
      case "function":
        let sfunc = String(value).split("\n");
        if ( String(value).match(/^\s+\[native code\]$/m) )
          sfunc = "[native code]";
        else
          sfunc = sfunc.length + " lines";
        s += pfx + tee + i + " (function) " + map + sfunc + "\n";
        break;
      case "object":
        s += pfx + tee + i + " (object) " + map + value + "\n";
        if (!compress)
          s += pfx + "|\n";
        if ((i != "parent") && (recurse) && value != null)
          s += this.objectTreeAsString(value, recurse - 1, compress, level + 1);
        break;
      case "string":
        if (value.length > 8192 + 5)
          s += pfx + tee + i + " (" + t + ")" + map + "'" + value.substr(0, 8192) + "' ... (" + value.length + " chars)\n";
        else
          s += pfx + tee + i + " (" + t + ")" + map + "'" + value + "'\n";
        break;
      case "":
        break;
      default:
        s += pfx + tee + i + " (" + t + ") " + map + value + "\n";
    }
    if (!compress)  s += pfx + "|\n";
    return s;
  },
  ignoreArray: new Array(),
  ignoreMap: new Map(),
  ignoreString: new String(),
  objectTreeAsString: function(o, recurse, compress, level) {
    let s = "";
    let pfx = "";
    let tee = "";
    try {
      if (recurse === undefined) recurse = 0;
      if (level === undefined) level = 0;
      if (compress === undefined) compress = true;
      
      for (let junk = 0; junk < level; junk++)
        pfx += (compress) ? "| " : "|  ";
      tee = (compress) ? "+ " : "+- ";
      if ( typeof(o) != 'undefined' && o != null ) {
        let index = this._checked.indexOf(o);
        if ( index >= 0 ) return pfx + tee + '[already shown]\n';
        else this._checked.push(o);
      }
      if (typeof(o) != "object" || o == null ) s += pfx + tee + " (" + typeof(o) + ") " + o + "\n";
      else {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_Objects
        let objectToInspect, properties = [], _listed = {};
        for( objectToInspect = o; objectToInspect !== null; objectToInspect = Object.getPrototypeOf(objectToInspect) )
          properties = properties.concat(Object.getOwnPropertyNames(objectToInspect));
        for ( let i of properties ) {
          try {
            if ( i in _listed || i in this.ignoreArray || i in this.ignoreMap || i in this.ignoreString ) continue;
            _listed[i] = true;
            s += this.dumpValue(o[i], i, recurse, compress, pfx, tee, level, '');
          } catch (ex) { s += pfx + tee + " (exception) " + ex + "\n"; }
        }
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map, Map is not Object        
        if ( typeof(o.keys) == 'function' && typeof(o.get) == 'function' ) {
          for ( let i of o.keys() ) {
            try {
              if ( i in _listed || i in this.ignoreArray || i in this.ignoreMap || i in this.ignoreString ) continue;
              _listed[i] = true;
              s += this.dumpValue(o.get(i), i, recurse, compress, pfx, tee, level, ' => ');
            } catch (ex) { s += pfx + tee + " (exception) " + ex + "\n"; }
          }
        }
        // nsIMsgDBHdr
        if ( typeof(o.propertyEnumerator) == 'object' && typeof(o.getStringProperty) == 'function' ) {
          let e = o.propertyEnumerator;
          while ( e.hasMore() ) {
            let i = e.getNext();
            s += this.dumpValue(o.getStringProperty(i), i, recurse, compress, pfx, tee, level, ' -> ');
          }
        }
      }
    } catch (ex) {
      s += pfx + tee + " (exception) " + ex + "\n";
      //this.logException(ex);
    }
    s += pfx + "*\n";
    return s;
  },
  
  logObject: function(obj, name, maxDepth, curDepth) {
    if (!this.verbose) return;
    this._checked = [];
    this.info(name + ": " + ( typeof(obj) == 'object' ? ( Array.isArray(obj) ? 'Array' : obj ) : '' ) + "\n" + this.objectTreeAsString(obj,maxDepth,true));
    this._checked = [];
  },
  
  logException: function(e, popup) {
    let msg = "";
    if ( 'name' in e && 'message' in e ) msg += e.name + ": " + e.message + "\n";
    if ( 'stack' in e ) msg += e.stack;
    if ( 'location' in e ) msg += e.location + "\n";
    if ( msg == '' ) msg += " " + e + "\n";
    msg = 'Caught Exception ' + msg;
    let fileName= e.fileName || e.filename || ( Cs.caller && Cs.caller.filename );
    let lineNumber= e.lineNumber || ( Cs.caller && Cs.caller.lineNumber );
    let sourceLine= e.sourceLine || ( Cs.caller && Cs.caller.sourceLine );
    let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
    scriptError.init(msg, fileName, sourceLine, lineNumber, e.columnNumber, scriptError.errorFlag, "chrome javascript");
    Services.console.logMessage(scriptError);
    if ( typeof(popup) == 'undefined' || popup ) this.popup("Exception", msg);
  },
  
};
let popupWins = {};
