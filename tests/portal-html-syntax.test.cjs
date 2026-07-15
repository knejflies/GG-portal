const fs = require("fs");

const files = ["admin/index.html", "employee/index.html", "portal/index.html", "portal.html"];

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((code) => code.trim());
  for (const code of inlineScripts) new Function(code);
  console.log(`${file}: ${inlineScripts.length} inline script(s) passed syntax validation.`);
}
