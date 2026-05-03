module.exports = {
    apps: [
      {
        name: "embedding-pipeline-worker",
        script: "src/main.py",
        interpreter: "./.venv/bin/python3",
        cwd: "<ABSOLUTE_PATH_TO_REPO>/Neurons/apps/workers/async/embedding-pipeline-worker",
        autorestart: true,
        watch: false,
      }
    ]
  }