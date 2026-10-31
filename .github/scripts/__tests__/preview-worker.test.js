import { describe, expect, it } from "vitest";

import worker from "../../preview-worker.js";

describe("documentation preview worker", () => {
  it("forwards requests and responses to the static asset binding", async () => {
    const request = new Request("https://example.com/docs");
    const response = new Response("missing", { status: 404 });

    const result = await worker.fetch(request, {
      ASSETS: {
        fetch: (received) => {
          expect(received).toBe(request);

          return response;
        },
      },
    });

    expect(result).toBe(response);
    expect(result.status).toBe(404);
  });
});
