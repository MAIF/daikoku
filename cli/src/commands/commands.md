# PROJECTS

daikoku projects init <NAME> <PATH>
daikoku projects clone <NAME> <PATH> <SERVER> <TOKEN>
daikoku projects add <NAME> <PATH> <OVERWRITE>
daikoku projects default <NAME>
daikoku projects remove <NAME> <REMOVE_FILES>
daikoku projects list 
daikoku projects clear 

# ASSETS
daikoku assets add <FILENAME> <TITLE> <DESC> <PATH> <SLUG>
daikoku assets remove <FILENAME> <PATH> <SLUG>
daikoku assets list
daikoku assets sync

# ENVIRONMENTS
daikoku environments clear
daikoku environments add <NAME> <SERVER> <TOKEN> <OVERWRITE> <FORCE>
daikoku environments default <NAME>
daikoku environments remove <NAME>
daikoku environments env <NAME>
daikoku environments list
daikoku environments patch <TOKEN>

# GENERATE
daikoku documentation <FILENAME> <TITLE> <DESC>

# LOGIN
daikoku login

# PULL
daikoku pull apis
daikoku pull apis <ID>

# VERSION
daikoku version

# WATCH
daikoku watch