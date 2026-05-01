const { execSync } = require("child_process");
try {
  console.log(execSync("git checkout src/App.tsx").toString());
} catch (e) {
  console.error(e.message);
}
