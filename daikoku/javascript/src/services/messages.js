
let callback = [];

let eventSource;

const MessagesEvents = {
  start() {
    if (window.EventSource) {
      console.log('Initialising server sent event');
      eventSource = new EventSource(`${window.__contextPath}/api/messages/_sse`);
      eventSource.addEventListener('open', e => {
        // console.log('SSE opened');
      }, false);
      eventSource.addEventListener('error', e => {
        // console.error('SSE error', e);
      }, false);
      eventSource.addEventListener('message', e => {
        // console.log('New event', e);
        const data = JSON.parse(e.data);
        callback.forEach(item => item.cb(data));
      }, false);
    }
  },
  stop() {
    if (eventSource) {
      eventSource.close();
    }
  }
};

export { MessagesEvents };




export function addCallback(cb, id) {
  callback = [...callback, { cb, id }];
}

export function removeCallback(id) {
  callback = callback.filter(c => c.id !== id);
}