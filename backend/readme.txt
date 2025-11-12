
#first time only, set region to TLV: 
gcloud config set run/region me-west1

#deploy to google cloudrun: 

gcloud run deploy taxmys16elf-prod --source .


https://www.tomray.dev/deploy-nestjs-cloud-run




### Script to delete dev database (run from bacend dir)
npx ts-node -r tsconfig-paths/register scripts/clear-dev-data.ts