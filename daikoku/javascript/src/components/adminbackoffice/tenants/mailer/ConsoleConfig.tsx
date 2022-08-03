import React from 'react';
// @ts-expect-error TS(6142): Module './MailTemplateButton' was resolved to '/Us... Remove this comment to see the full error message
import { MailTemplateButton } from './MailTemplateButton';

export function ConsoleConfig({ ...props }) {
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <MailTemplateButton {...props} />;
}
