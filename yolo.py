import json
import requests

# Run inference on an image
url = "https://predict-f8mbbq9g6kiwnrd4umec-7nza6zqsha-ez.a.run.app"
headers = {"x-api-key": "b42e02b5a56c145f6ae7513aae888cdf9f570fa970"}
data = {"imgsz": 640, "conf": 0.25, "iou": 0.45}
with open("G:\\My Drive\\Semesters\\Design\\Dataset\\Rassem_keys\\anahtar-teslim-31TcRHxG-1_jpeg.rf.42c103ff94d8db64091658b177273963.jpg", "rb") as f:
	response = requests.post(url, headers=headers, data=data, files={"file": f})

# Check for successful response
response.raise_for_status()

# Print inference results
print(json.dumps(response.json(), indent=2))