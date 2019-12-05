import React from 'react';
import { Redirect } from 'react-router-dom';
import { toastr } from 'react-redux-toastr';

const avoidMatching = ['settings', 'notifications', 'organizations', 'teams'];

function matched(f, p) {
  const component = f(p);
  const name =
    component.type && component.type.displayName ? component.type.displayName : 'Unknown';
  console.log('match', `<${name} />`, 'on', p.match.path);
  return component;
}

export function smartMatch(f) {
  return p => {
    if (p.match.path.indexOf('/:teamId') === 0) {
      const searched = p.match.url.split('/')[1];
      if (avoidMatching.indexOf(searched) !== -1) {
        return null;
      } else {
        if (p.match.path === '/:teamId/:apiId') {
          if (p.match.params.apiId === 'settings') {
            return null;
          } else {
            return matched(f, p);
          }
        } else {
          return matched(f, p);
        }
      }
    } else {
      return matched(f, p);
    }
  };
}

export function smartRedirect(f) {
  return p => {
    if (p.match.path.indexOf('/teams/:teamId/apis/') === 0) {
      const to = p.match.url.replace('/teams/', '/').replace('/apis/', '/');
      console.log('redirect from', p.match.url, 'to', to);
      toastr.error('Prevenir Mathieu', `Redirect from ${p.match.url} to ${to}`);
      return <Redirect to={to} />;
    } else if (p.match.path.indexOf('/teams/:teamId/apis') === 0) {
      const to = p.match.url.replace('/teams/', '/').replace('/apis', '');
      console.log('redirect from', p.match.url, 'to', to);
      toastr.error('Prevenir Mathieu', `Redirect from ${p.match.url} to ${to}`);
      return <Redirect to={to} />;
    } else if (p.match.path.indexOf('/teams/:teamId') === 0) {
      const to = p.match.url.replace('/teams/', '/');
      console.log('redirect from', p.match.url, 'to', to);
      toastr.error('Prevenir Mathieu', `Redirect from ${p.match.url} to ${to}`);
      return <Redirect to={to} />;
    } else {
      return smartMatch(f)(p);
    }
  };
}
