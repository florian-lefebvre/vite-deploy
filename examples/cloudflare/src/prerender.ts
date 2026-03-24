import virtual from "virtual:test"

export default {
  getStaticPaths(): Array<string> {
    return ["/foo", ...virtual];
  },
};

// full ssr build (prerender: true)
// partial ssr build (prerender: false)
