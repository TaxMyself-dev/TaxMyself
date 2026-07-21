
########################################
###### deploy Backend to Cloud Run PROD #
########################################

#first time only, set region to TLV: 
gcloud config set run/region me-west1

#deploy to google cloudrun: 

gcloud run deploy taxmys16elf-prod --source .


https://www.tomray.dev/deploy-nestjs-cloud-run

########################################
###### deploy Backend to Cloud Run DEV #
########################################

cd backend

# First time only — set the Cloud Run region
gcloud config set run/region me-west1

# Deploy current backend code only to DEV
gcloud run deploy taxmys16elf-dev --source . --project taxmyself-prod --region me-west1


### Script to delete dev database (run from backend dir)
npx ts-node -r tsconfig-paths/register scripts/clear-dev-data.ts