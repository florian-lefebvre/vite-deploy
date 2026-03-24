export default {
  fetch(request) {
    return new Response(`Running ${request.url} in ${navigator.userAgent}!`);
  },
} satisfies ExportedHandler<Env>;
