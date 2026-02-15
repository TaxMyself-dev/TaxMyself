


gcloud run deploy proxy --source=. --region=me-west1 --vpc-connector=cloud-run-vpc-connector --vpc-egress=all-traffic --set-env-vars=PROXY_MODE=test

gcloud run deploy proxy --source=. --region=me-west1 --vpc-connector=cloud-run-vpc-connector --vpc-egress=all-traffic --set-env-vars=PROXY_MODE=feezback-dev


