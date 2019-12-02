# Daikoku demo

## Run demo

```sh
docker-compose up -d
docker-compose logs -f
```

### If daikoku import fails

```sh
docker-compose stop daikoku
docker-compose rm daikoku
docker-compose up -d daikoku
```

### Stop demo
```sh
docker-compose down
```


## Apps
* otoroshi instance: http://otoroshi.oto.tools
* Daikoku instance: http://daikoku.oto.tools
* Demo api: http://api.oto.tools

##Apis and teams
### Otoroshi access
* admin otoroshi : admin@otoroshi.com / password

### Daikoku access
* super admin : admin@daikoku.io / password
* producer team
    * user api producer : producer@daikoku.io / password
* consumer team
    * user api consumer : consumer@daikoku.io / password
* Privileged team
    * user api consumer : consumer@daikoku.io / password
    

##Usage
Api is accessible in http://daikoku.oto.tools/producer-team/demo-api

ApiKeys for consumer team are accessible in http://daikoku.oto.tools/consumer-team/settings/apikeys/demo-api

ApiKeys for privileged team are accessible in http://daikoku.oto.tools/privileged-partner/settings/apikeys/demo-api

With your credentials, you can run the following command in a terminal
````sh
curl -X GET http://api.oto.tools -u <your credentials> | jqn
````
