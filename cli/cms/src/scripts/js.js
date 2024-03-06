document.addEventListener("DOMContentLoaded", async function () {
  const res = await fetch('{{daikoku-page-url "data/preview.json"}}')
  const { news } = await res.json()
  
  console.log(news)

  const container = document.getElementById('news')
  
  const blocks = news.map(({ id, title, content, url, slug }) => {
    return `{{daikoku-include-block "blocks/Card.html" title="${title}" content="${content}" url="${url}" slug="${slug}"  }}`
  })
  
  console.log(blocks)
  container.innerHTML += blocks.join('\n')
});


function askForApiKey(plan) {
  console.log("askForApiKey", plan)
} 
