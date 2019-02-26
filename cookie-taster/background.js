var resource_urls = {}, ignore_urls = [];
const STOP_HEADER = "###";

function onStartedDownload(id) {
    console.log(`Started downloading: ${id}`);
}

function onFailed(error) {
    console.log(`Download failed: ${error}`);
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9\.]/gi, '_').toLowerCase();
}

function download(data, fname) {
    var blob = new Blob([data], {type: 'application/javascript'})
    var blob_url = URL.createObjectURL(blob);

    var downloading = browser.downloads.download({
          url : blob_url,
          filename : sanitizeFilename(fname),
          conflictAction : 'uniquify',
    });

    //console.log(sanitizeFilename(fname));

    downloading.then(onStartedDownload, onFailed);
}

function containsHeader(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() == name.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function removeHeader(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() == name.toLowerCase()) {
      headers.splice(i, 1);
      break;
    }
  }
}

function equal (buf1, buf2) {
  if (buf1.byteLength != buf2.byteLength) return false;
  var dv1 = new Int8Array(buf1);
  var dv2 = new Int8Array(buf2);
  for (var i = 0 ; i != buf1.byteLength ; i++)
  {
      if (dv1[i] != dv2[i]) return false;
  }
  return true;
}

browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    let previouslySeen = ((details.url in resource_urls) && Object.keys(resource_urls[details.url]).length >= 2);

    //TODO: check to see if initial request has headers, ignore if no
    if (!previouslySeen && !containsHeader(details.requestHeaders, 'cookie')) {
      ignore_urls.push(details.url);
    }

    if (previouslySeen) {
      console.log('Removing cookies for ' + details.type + ': ' + details.url);
      removeHeader(details.requestHeaders, 'cookie');
    }

    return {requestHeaders: details.requestHeaders};  
  },
  // filters
  {urls: ['<all_urls>']},
  // extraInfoSpec
  ['blocking', 'requestHeaders']);

function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  if (!(details.url in resource_urls)) {
    resource_urls[details.url] = {};
    resource_urls[details.url][details.requestId] = {
      'cookie': true,
      'type': details.type,
      'data': null
    };
  } else if (!(details.requestId in resource_urls[details.url])) {
    resource_urls[details.url][details.requestId] = {
      'cookie': false,
      'type': details.type,
      'data': null
    };
  }

  filter.ondata = event => {
    if (details.type == 'script' || details.type == 'stylesheet') {
      input = decoder.decode(event.data, {stream: true});
    } else {
      input = event.data;
    }

    first_packet = resource_urls[details.url][details.requestId]['data'] == null;   

    if (first_packet) {
      resource_urls[details.url][details.requestId]['data'] = input;
    } else {
      let dtype = resource_urls[details.url][details.requestId]['type'];
      if ((dtype == 'script') || (dtype == 'stylesheet')) {
        resource_urls[details.url][details.requestId]['data'] += input;
      } else {
        //TODO: append array buffer 
      }
    }

    if (details.type == 'script' || details.type == 'stylesheet') {
      // prepend nonsense JS to prevent execution for secondary load
      if (details.type == 'script' && first_packet && Object.keys(resource_urls[details.url]).length == 2) {
        console.log(STOP_HEADER + input);
        output = encoder.encode(STOP_HEADER + input);
      } else {
        output = encoder.encode(input);
      }
    } else {
      output = event.data;
    }    

    filter.write(output);
  }

  filter.onstop = event => {
    let keys = Object.keys(resource_urls[details.url])

    if (!resource_urls[details.url][details.requestId]['cookie']) {
      data1 = resource_urls[details.url][keys[0]]['data'];
      data2 = resource_urls[details.url][keys[1]]['data'];
      cookieStr1 = resource_urls[details.url][keys[0]]['cookie'] ? 'cookie' : 'no_cookie';
      cookieStr2 = resource_urls[details.url][keys[1]]['cookie'] ? 'cookie' : 'no_cookie';
      if (details.type == 'script' || details.type == 'stylesheet') {
        if(data1 != data2) {
          download(data1, [details.url, details.type, cookieStr1].join('.'));
          download(data2, [details.url, details.type, cookieStr2].join('.'));
        }
      } else {
        if (!equal(data1, data2)) {
          download(data1, [details.url, details.type, cookieStr1].join('.'));
          download(data2, [details.url, details.type, cookieStr2].join('.'));
        }
      }
    } else {
      if (!ignore_urls.includes(details.url)) {
        browser.tabs.sendMessage(details.tabId, {'url': details.url, 'type': details.type, 'timeout': 500});
      }
    }
    filter.disconnect();
  }

  return {};
}

function new_frame(details) {
  resource_urls = {};
  ignore_urls = [];
}


browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["<all_urls>"], types: ["script","stylesheet","media","object","image"]},
  ['blocking']
);

browser.webRequest.onBeforeRequest.addListener(
  new_frame,
  {urls: ["<all_urls>"], types: ["main_frame"]},
  ['blocking']
);

