/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import fetchMock from "fetch-mock-jest";

import { getVectorConfig } from "../../../src/vector/getconfig";

fetchMock.config.overwriteRoutes = true;

describe("getVectorConfig()", () => {
    const elementDomain = "app.element.io";
    const now = 1234567890;
    const specificConfig = {
        brand: "specific",
    };
    const generalConfig = {
        brand: "general",
    };

    beforeEach(() => {
        Object.defineProperty(window, "location", {
            value: { href: `https://${elementDomain}`, hostname: elementDomain },
            writable: true,
        });

        // stable value for cachebuster
        jest.spyOn(Date, "now").mockReturnValue(now);
        jest.clearAllMocks();
        fetchMock.mockClear();
    });

    afterAll(() => {
        jest.spyOn(Date, "now").mockRestore();
    });

    it("requests specific config for document domain", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", specificConfig);
        fetchMock.getOnce("express:/config.json", generalConfig);

        await expect(getVectorConfig()).resolves.toEqual(specificConfig);
    });

    it("adds trailing slash to relativeLocation when not an empty string", async () => {
        fetchMock.getOnce("express:../config.app.element.io.json", specificConfig);
        fetchMock.getOnce("express:../config.json", generalConfig);

        await expect(getVectorConfig("..")).resolves.toEqual(specificConfig);
    });

    it("returns general config when specific config succeeds but is empty", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", {});
        fetchMock.getOnce("express:/config.json", generalConfig);

        await expect(getVectorConfig()).resolves.toEqual(generalConfig);
    });

    it("returns general config when specific config 404s", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", { status: 404 });
        fetchMock.getOnce("express:/config.json", generalConfig);

        await expect(getVectorConfig()).resolves.toEqual(generalConfig);
    });

    it("returns general config when specific config is fetched from a file and is empty", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", 0);
        fetchMock.getOnce("express:/config.json", generalConfig);

        await expect(getVectorConfig()).resolves.toEqual(generalConfig);
    });

    it("returns general config when specific config returns a non-200 status", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", { status: 401 });
        fetchMock.getOnce("express:/config.json", generalConfig);

        await expect(getVectorConfig()).resolves.toEqual(generalConfig);
    });

    it("returns general config when specific config returns an error", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", { throws: "err1" });
        fetchMock.getOnce("express:/config.json", generalConfig);

        await expect(getVectorConfig()).resolves.toEqual(generalConfig);
    });

    it("rejects with an error when general config rejects", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", { throws: "err-specific" });
        fetchMock.getOnce("express:/config.json", { throws: "err-general" });

        await expect(getVectorConfig()).rejects.toBe("err-general");
    });

    it("rejects with an error when config is invalid JSON", async () => {
        fetchMock.getOnce("express:/config.app.element.io.json", { throws: "err-specific" });
        fetchMock.getOnce("express:/config.json", '{"invalid": "json",}');

        // We can't assert it'll be a SyntaxError as node-fetch behaves differently
        // https://github.com/wheresrhys/fetch-mock/issues/270
        await expect(getVectorConfig()).rejects.toThrow("in JSON at position 19");
    });
});
