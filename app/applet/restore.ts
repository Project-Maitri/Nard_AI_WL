import { execSync } from "child_process";
try {
  execSync("git checkout -- src/App.tsx", { stdio: "inherit" });
} catch (e) {
  console.error(e);
}
