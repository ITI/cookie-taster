browser.runtime.onMessage.addListener(injectScript);

function injectScript(request, sender, sendResponse) {
  var s = document.createElement('script');
  s.type = 'text/javascript';
  s.src = request['url']
  document.body.appendChild(s);
}