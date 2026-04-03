#!/usr/bin/env node

const path = require("node:path");
const moduleAlias = require("module-alias");

moduleAlias.addAlias("@", path.join(__dirname, "..", "dist"));

const { main } = require("../dist/index.js");

void main();
