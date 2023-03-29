import classNames from 'classnames';
import { nanoid } from 'nanoid';
import React, { useEffect, useState, useMemo, PropsWithChildren } from 'react';

type ButtonType = 'success' | 'warning' | 'info' | 'danger' | 'primary' | 'secondary'
type Props = {
  type: ButtonType,
  onPress: () => Promise<any>,
  onSuccess?: () => void,
  feedbackTimeout: number,
  className?: string,
  disabled: boolean,
  style?: { [key: string]: string },
}
export function FeedbackButton(props: PropsWithChildren<Props>) {
  const [uploading, setUploading] = useState(false);
  const [result, onResult] = useState('waiting');
  const [color, setColor] = useState<ButtonType>(props.type);
  const id = useMemo(() => nanoid(), [])

  useEffect(() => {
    let timeout;

    if (result !== 'waiting') {
      setUploading(false);
      timeout = setTimeout(() => {
        onResult('waiting');
      }, props.feedbackTimeout);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [result]);

  const failed = result === 'failed';
  const successed = result === 'success';
  const waiting = result === 'waiting';
  const loading = waiting && uploading;

  useEffect(() => {
    setColor(getColor());
  }, [result, uploading]);

  const getColor = (): ButtonType => {
    if (successed) return 'success';
    else if (failed) return 'danger';
    else if (loading) return 'secondary';

    return props.type;
  };

  const setStyle = () => {
    if (failed) {
      const { backgroundColor, borderColor, ...rest } = props.style || {};
      return rest;
    } else {
      return props.style;
    }
  };

  return (
    <button
      id={id}
      type="button"
      disabled={props.disabled}
      className={classNames(`btn btn-outline-${color}`, props.className)}
      style={setStyle()}
      onClick={() => {
        if (!uploading && waiting) {
          setUploading(true);
          const timer = Date.now();
          props.onPress()
            .then(() => {
              const diff = Date.now() - timer;
              if (diff > 150) {
                if (props.onSuccess) setTimeout(props.onSuccess, 250);
                onResult('success');
              } else {
                setTimeout(() => {
                  onResult('success');
                  if (props.onSuccess) setTimeout(props.onSuccess, 250);
                }, 150 - diff);
              }
            })
            .catch((err) => {
              onResult('failed');
              throw err;
            });
        }
      }}>
      {loading && (
        <i
          className="fas fa-spinner fa-spin fa-sm"
          style={{
            opacity: loading ? 1 : 0,
            transition: 'opacity 2s',
          }}
        />
      )}
      {successed && (
        <i
          className="fas fa-check"
          style={{
            opacity: successed ? 1 : 0,
            transition: 'opacity 2s',
          }}
        />
      )}
      {failed && (
        <i
          className="fas fa-times"
          style={{
            opacity: failed ? 1 : 0,
            transition: 'opacity 2s',
          }}
        />
      )}
      {!loading && !successed && !failed && props.children}
    </button>
  );
}
