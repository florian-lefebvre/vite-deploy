import virtual from "virtual:test"

export default {
  getStaticPaths(): Array<string> {
    return ["/foo", ...virtual];
  },
};
