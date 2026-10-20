// The document's server variable has its own default; Try it out must hit the origin the page
// was opened on, so the session cookie and the Origin check match the web app.
const sameOrigin = (request) => {
  const url = new URL(request.url, window.location.href);
  request.url = `${window.location.origin}${url.pathname}${url.search}`;
  return request;
};

window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  withCredentials: true,
  deepLinking: true,
  // The default validator is a badge image from a third-party host.
  validatorUrl: null,
  requestInterceptor: sameOrigin,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: 'StandaloneLayout',
});
