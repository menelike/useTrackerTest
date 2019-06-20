import {createBrowserHistory} from 'history';
import {Route, Router, Switch} from 'react-router-dom';
import React, {useState, useEffect} from 'react';
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

const shallowEqualArray = (arrA, arrB) => {
  if (arrA === arrB) {
    return true;
  }

  if (!arrA || !arrB) {
    return false;
  }

  const len = arrA.length;

  if (arrB.length !== len) {
    return false;
  }

  for (let i = 0; i < len; i++) {
    if (arrA[i] !== arrB[i]) {
      return false;
    }
  }

  return true;
};

class DependencyMemoize {
  constructor() {
    this._instances = {};
    this._memoizedData = {};
    this._idCount = 0;
  }

  call(instanceId, deps, func) {
    if (deps && instanceId in this._memoizedData && shallowEqualArray(this._instances[instanceId], deps)) {
      // always update deps to avoid duplicates preventing garbage collection
      this._instances[instanceId] = deps;

      return this._memoizedData[instanceId];
    }

    const data = func();
    Meteor.isDevelopment && checkCursor(data);
    this._instances[instanceId] = deps;
    this._memoizedData[instanceId] = data;
    return data
  }

  update(instanceId, deps, data) {
    this._instances[instanceId] = deps;
    this._memoizedData[instanceId] = data;
  }

  createId() {
    this._idCount += 1;
    return this._idCount;
  }

  clear(instanceId) {
    delete this._instances[instanceId];
    delete this._memoizedData[instanceId];
  }
}

const memoize = new DependencyMemoize();

const useTracker = (reactiveFn, deps) => {
  // Note : we always run the reactiveFn in Tracker.nonreactive in case
  // we are already inside a Tracker Computation. This can happen if someone calls
  // `ReactDOM.render` inside a Computation. In that case, we want to opt out
  // of the normal behavior of nested Computations, where if the outer one is
  // invalidated or stopped, it stops the inner one too.

  const [[instanceId], forceUpdate] = useState(() => {
    // use an Array to enforce an update when forceUpdating the same Id
    // it seems the state is compared to prevState which prevents a forceUpdate?
    // could not find the specs for this
    return [memoize.createId()];
  });

  useEffect(() => {
    // Set up the reactive computation.
    const computation = Tracker.nonreactive(() =>
      Tracker.autorun((c) => {
        // trigger reactivity
        const data = reactiveFn(); // this is a wasted call when run initially, can this be avoided?
        Meteor.isDevelopment && checkCursor(data);
        if (!c.firstRun) {
          // reuse the reactive result and update the memoization
          // this avoids a call to reactiveFn() after forceUpdate triggers a re-render
          memoize.update(instanceId, deps, data);
          forceUpdate([instanceId]);
        }
      })
    );

    // On effect cleanup, stop the computation.
    return () => {
      computation.stop();
      memoize.clear(instanceId);
    }
  }, deps);

  return Tracker.nonreactive(() => memoize.call(instanceId, deps, reactiveFn));
};

function withTrackerNew(options) {
  return Component => {
    const expandedOptions = typeof options === 'function' ? {getMeteorData: options} : options;
    const {getMeteorData, pure = true} = expandedOptions;

    const WithTracker = React.forwardRef((props, ref) => {
      const data = useTracker(() => getMeteorData(props) || {}, [props]);
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
