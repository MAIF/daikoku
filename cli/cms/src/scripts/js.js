document.addEventListener("DOMContentLoaded", async function () {
  const res = await fetch('{{daikoku-page-url "62025dcf1a0100ac3d020ffc"}}')
  const { news } = await res.json()
  
  console.log(news)

  const container = document.getElementById('news')
  
  const blocks = news.map(({ id, title, content, url, slug }) => {
    return `{{daikoku-include-block "62026d251501007a8439f599" title="${title}" content="${content}" url="${url}" slug="${slug}"  }}`
  })
  
  console.log(blocks)
  container.innerHTML += blocks.join('\n')
});


function askForApiKey(plan) {
  console.log("askForApiKey", plan)
} 
