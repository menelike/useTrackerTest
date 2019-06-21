import {createBrowserHistory} from 'history';
import {Route, Router, Switch} from 'react-router-dom';
import React, {useState, useEffect, useRef} from 'react';
import {Tracker} from 'meteor/tracker';
import {withTracker} from 'meteor/react-meteor-data';
import {Meteor} from 'meteor/meteor'

const history = createBrowserHistory();

// Warns if data is a Mongo.Cursor or a POJO containing a Mongo.Cursor.
function checkCursor(data) {
  let shouldWarn = false;
  if (Package.mongo && Package.mongo.Mongo && data && typeof data === 'object') {
    if (data instanceof Package.mongo.Mongo.Cursor) {
      shouldWarn = true;
    } else if (Object.getPrototypeOf(data) === Object.prototype) {
      Object.keys(data).forEach((key) => {
        if (data[key] instanceof Package.mongo.Mongo.Cursor) {
          shouldWarn = true;
        }
      });
    }
  }
  if (shouldWarn) {
    // Use React.warn() if available (should ship in React 16.9).
    const warn = React.warn || console.warn.bind(console);
    warn(
      'Warning: your reactive function is returning a Mongo cursor. '
      + 'This value will not be reactive. You probably want to call '
      + '`.fetch()` on the cursor before returning it.'
    );
  }
}

// taken from https://github.com/facebook/react/blob/34ce57ae751e0952fd12ab532a3e5694445897ea/packages/shared/objectIs.js
function is(x, y) {
  return (
    (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y) // eslint-disable-line no-self-compare
  );
}

// inspired by https://github.com/facebook/react/blob/34ce57ae751e0952fd12ab532a3e5694445897ea/packages/react-reconciler/src/ReactFiberHooks.js#L307-L354
function areHookInputsEqual(nextDeps, prevDeps) {
  if (!prevDeps || !nextDeps) {
    return false;
  }

  const len = nextDeps.length;

  if (prevDeps.length !== len) {
    return false;
  }

  for (let i = 0; i < len; i++) {
    if (!is(nextDeps[i], prevDeps[i])) {
      return false;
    }
  }

  return true;
}

function useTracker(reactiveFn, deps) {
  // When rendering on the server, we don't want to use the Tracker.
  // We only do the first rendering on the server so we can get the data right away
  if (Meteor.isServer) {
    return reactiveFn();
  }

  const previousDeps = useRef();
  const computation = useRef();
  const trackerData = useRef();

  const [, forceUpdate] = useState();

  const dispose = () => {
    if (computation.current) {
      computation.current.stop();
      computation.current = null;
    }
  };

  // this is called at componentWillMount and componentWillUpdate equally
  // simulates a synchronous useEffect, as a replacement for calculateData()
  // if prevDeps or deps are not set shallowEqualArray always returns false
  if (!areHookInputsEqual(previousDeps.current, deps)) {
    dispose();

    // Use Tracker.nonreactive in case we are inside a Tracker Computation.
    // This can happen if someone calls `ReactDOM.render` inside a Computation.
    // In that case, we want to opt out of the normal behavior of nested
    // Computations, where if the outer one is invalidated or stopped,
    // it stops the inner one.
    computation.current = Tracker.nonreactive(() => (
      Tracker.autorun((c) => {
        if (c.firstRun) {
          // Todo do we need a try finally block?
          const data = reactiveFn();
          Meteor.isDevelopment && checkCursor(data);

          // don't recreate the computation if no deps have changed
          previousDeps.current = deps;
          trackerData.current = data;
        } else {
          // make sure that shallowEqualArray returns false
          previousDeps.current = Math.random();
          // Stop this computation instead of using the re-run.
          // We use a brand-new autorun for each call to getMeteorData
          // to capture dependencies on any reactive data sources that
          // are accessed.  The reason we can't use a single autorun
          // for the lifetime of the component is that Tracker only
          // re-runs autoruns at flush time, while we need to be able to
          // re-call getMeteorData synchronously whenever we want, e.g.
          // from componentWillUpdate.
          c.stop();
          // trigger a re-render
          // Calling forceUpdate() triggers componentWillUpdate which
          // recalculates getMeteorData() and re-renders the component.
          forceUpdate(Math.random());
        }
      })
    ));
  }

  // replaces this._meteorDataManager.dispose(); on componentWillUnmount
  useEffect(() => dispose, []);

  return trackerData.current;
}

function withTrackerNew(options) {
  return Component => {
    const expandedOptions = typeof options === 'function' ? {getMeteorData: options} : options;
    const {getMeteorData, pure = true} = expandedOptions;

    const WithTracker = React.forwardRef((props, ref) => {
      const data = useTracker(() => getMeteorData(props) || {});
      return <Component ref={ref} {...props} {...data} />;
    });

    return pure ? React.memo(WithTracker) : WithTracker;
  };
}


const RouteWrapper = (props) => {
  console.log(`routed to ${props.location.pathname}`);
  // no reactivity needed to demonstrate this issue
  const trackerPath = useTracker(() => props.path, [props.path]);
  if (trackerPath !== props.path) {
    console.error(`tracker returned ${trackerPath} but should be ${props.path}`)
  }
  console.log(`trackerPath: ${trackerPath}`);
  return <Route {...props} />
};

const HocRoute = (props) => {
  console.log(`routed to ${props.location.pathname}`);
  // no reactivity needed to demonstrate this issue
  const trackerPath = props.trackerPath;
  if (trackerPath !== props.path) {
    console.error(`tracker returned ${trackerPath} but should be ${props.path}`)
  }
  console.log(`trackerPath: ${trackerPath}`);
  return <Route {...props} />
};

const HOCRouteWrapper = withTracker({
  getMeteorData: (props) => ({
    trackerPath: props.path,
  }),
  pure: false,
})(HocRoute);

const NewHOCRouteWrapper = withTrackerNew({
  getMeteorData: (props) => ({
    trackerPath: props.path,
  }),
  pure: false,
})(HocRoute);

const App = () => (
  <Router history={history}>
    <React.Fragment>
      <button onClick={() => history.push('/')}>
        /
      </button>
      <button onClick={() => history.push('/hookFoo')}>
        /hookFoo
      </button>
      <button onClick={() => history.push('/hookBar')}>
        /hookBar
      </button>
      <button onClick={() => history.push('/withTrackerFoo')}>
        /withTrackerFoo
      </button>
      <button onClick={() => history.push('/withTrackerBar')}>
        /withTrackerBar
      </button>
      <button onClick={() => history.push('/newWithTrackerFoo')}>
        /newWithTrackerFoo
      </button>
      <button onClick={() => history.push('/newWithTrackerBar')}>
        /newWithTrackerBar
      </button>
      <button onClick={() => history.push('/keyedfoo')}>
        /keyedfoo
      </button>
      <button onClick={() => history.push('/keyedbar')}>
        /keyedbar
      </button>
      <br/>
      <Switch>
        <RouteWrapper exact path="/" render={() => <span>/</span>}/>
        <RouteWrapper path="/hookFoo" render={() => <span>/hookFoo</span>}/>
        <RouteWrapper path="/hookBar" render={() => <span>/hookBar</span>}/>
        <NewHOCRouteWrapper path="/newWithTrackerFoo" render={() => <span>/newWithTrackerFoo</span>}/>
        <NewHOCRouteWrapper path="/newWithTrackerBar" render={() => <span>/newWithTrackerBar</span>}/>
        <HOCRouteWrapper path="/withTrackerFoo" render={() => <span>/withTrackerFoo</span>}/>
        <HOCRouteWrapper path="/withTrackerBar" render={() => <span>/withTrackerBar</span>}/>
        <RouteWrapper key="keyedfoo" path="/keyedfoo" render={() => <span>/keyedfoo</span>}/>
        <RouteWrapper key="keyedbar" path="/keyedbar" render={() => <span>/keyedbar</span>}/>
      </Switch>
    </React.Fragment>
  </Router>
);

export default App;
