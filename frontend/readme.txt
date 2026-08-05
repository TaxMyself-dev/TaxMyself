########################################
######## deploy app to firebase ########
########################################

cd frontend

# building public production files
npm run build

# if needed: 
firebase login --reauth

firebase deploy -P prod --only hosting:app


########################################
###### deploy DEV app to firebase ######
########################################

cd frontend

# build the application with DEV cloud configuration
npm run build:dev

# if needed:
firebase login --reauth

# deploy to the permanent DEV Firebase Hosting site
firebase deploy -P dev --only hosting:app


########################################
###### deploy landing to firebase ######
########################################

cd landing

npm run build

firebase use prod

firebase deploy -P prod --only hosting:landing