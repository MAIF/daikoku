function askForApiKey(api, plan) {
  
  const options = {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-type': 'application/json',
    }
  }
  
  fetch('/api/me/teams/own', options)
    .then(r => r.json())
    .then(team => {
      console.log("askForApiKey", api, plan, team)
      fetch(`/api/apis/${api}/subscriptions`, {
        ...options,
        method: 'POST',
        body: JSON.stringify({
          plan, 
          teams: [team._id]
        })
      })
      .then(r => {
        if(r.status === 200) {
          r.json()
            .then(subscriptions => {
              if(subscriptions[0].error) {
                const id = `subscription-error-${plan}`
                document.getElementById(id).innerHTML = subscriptions[0].error
                document.getElementById(id).style.display = 'block'  
              } else {
                const keyId = `subscription-success-key-${plan}`
                const secretId = `subscription-success-secret-${plan}`
                document.getElementById(keyId).innerHTML = subscriptions[0].subscription.apiKey.clientId
                document.getElementById(secretId).innerHTML = subscriptions[0].subscription.apiKey.clientSecret
                document.getElementById(`subscription-success-${plan}`).style.display = 'block'  
              }
              
            })
        }
      })
      .catch(r => console.log(r))
    })
} 