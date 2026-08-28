import { expect, test } from "bun:test";

import worker from "../src/index";

test("publishes fetch and scheduled handlers", () => {
  expect(worker.fetch).toBeInstanceOf(Function);
  expect(worker.scheduled).toBeInstanceOf(Function);
});
