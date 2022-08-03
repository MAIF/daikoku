import orderBy from 'lodash/orderBy';
import last from 'lodash/last';

let callback: any = [];

let eventSource: any;

const MessagesEvents = {
  start() {
    if (window.EventSource) {
      console.log('Initialising server sent event');
      eventSource = new EventSource('/api/messages/_sse');
      eventSource.addEventListener(
        'open',
        // @ts-expect-error TS(7006): Parameter 'e' implicitly has an 'any' type.
        (e) => {
          // console.log('SSE opened');
        },
        false
      );
      eventSource.addEventListener(
        'error',
        // @ts-expect-error TS(7006): Parameter 'e' implicitly has an 'any' type.
        (e) => {
          // console.error('SSE error', e);
        },
        false
      );
      eventSource.addEventListener(
        'message',
        // @ts-expect-error TS(7006): Parameter 'e' implicitly has an 'any' type.
        (e) => {
          // console.log('New event', e);
          const data = JSON.parse(e.data);
          // @ts-expect-error TS(7006): Parameter 'item' implicitly has an 'any' type.
          callback.forEach((item) => item.cb(data));
        },
        false
      );
    }
  },
  stop() {
    if (eventSource) {
      eventSource.close();
    }
  },
};

export { MessagesEvents };

export function addCallback(cb: any, id: any) {
  callback = [...callback, { cb, id }];
}

export function removeCallback(id: any) {
  // @ts-expect-error TS(7006): Parameter 'c' implicitly has an 'any' type.
  callback = callback.filter((c) => c.id !== id);
}

export const fromMessagesToDialog = (messages: any) => orderBy(messages, ['date']).reduce((dialog, message) => {
  if (!dialog.length) {
    return [[message]];
  } else {
    // @ts-expect-error TS(7022): 'last' implicitly has type 'any' because it does n... Remove this comment to see the full error message
    const last = last(dialog);
    if (last.some((m: any) => m.sender === message.sender)) {
      return [...dialog.slice(0, dialog.length - 1), [...last, message]];
    } else {
      return [...dialog, [message]];
    }
  }
}, []);
