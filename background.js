var script_cookie_hashes = {};

function removeHeader(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() == name) {
      headers.splice(i, 1);
      break;
    }
  }
}

browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url in script_cookie_hashes) {
      console.log('Removing cookies for : ' + details.url);
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

  filter.ondata = event => {
    let str = decoder.decode(event.data, {stream: true});
    var hash = sha256.create();
    hash.update(str);
      
    if (!(details.url in script_cookie_hashes)){
      script_cookie_hashes[details.url] = hash.hex();
      // trigger second download of the same script
      
      browser.tabs.sendMessage(details.tabId, {'url': details.url});
    } else if (details.url in script_cookie_hashes) {
      // check for differences and write to console
      if (hash.hex() != script_cookie_hashes[details.url]) {
        console.log("CHANGE: " + details.url);
      }
    } 
    filter.write(encoder.encode(str));
    filter.disconnect();
  }

  return {};
}

function new_frame(details) {
  script_cookie_hashes = {}
}


browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["<all_urls>"], types: ["script"]},
  ['blocking']
);

browser.webRequest.onBeforeRequest.addListener(
  new_frame,
  {urls: ["<all_urls>"], types: ["main_frame"]},
  ['blocking']
);

