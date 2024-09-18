# CMS
daikoku cms init <NAME> <PATH>
daikoku cms migrate <NAME> <PATH> <SERVER> <APIKEY> 
crash si le fichier .daikoku_metadata est present

daikoku cms list
daikoku cms add <NAME> <PATH> <OVERWRITE>
daikoku cms switch <NAME> // change default en switch
daikoku cms remove <NAME> <REMOVE_FILES>
daikoku cms clear
avec confirmation pour faire plaisir

# PUSH
daikoku push <DRY_RUN> <FILEPATH>
qui peut être un dossier

# ASSETS
daikoku assets push <FILENAME> <TITLE> <DESC> <PATH> <SLUG>
daikoku assets remove <FILENAME> <PATH> <SLUG>
daikoku assets list
daikoku assets sync

# ENVIRONMENTS
daikoku environments clear
daikoku environments add <NAME> <SERVER> <OVERWRITE>
daikoku environments switch <NAME> // rename du default
daikoku environments remove <NAME>
daikoku environments info <NAME> <FULL> // rename from env
daikoku environments list
daikoku environments config <APIKEY>
// editer le .gitignore pour mettre le .secrets du .daikoku

# GENERATE
daikoku generate documentation <FILENAME> <TITLE> <DESC>

# LOGIN (plus de liste de cms autorisés)
daikoku login

# PULL
daikoku pull apis
daikoku pull mails

# VERSION
daikoku version

# WATCH
daikoku watch

# CMS API
à créer

# documentations folder sorti des apis

# créer un fichier .secrets
avec les apikeys et les cookies