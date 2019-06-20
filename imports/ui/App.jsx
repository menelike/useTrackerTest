import {createBrowserHistory} from 'history';
import {Route, Router, Switch} from 'react-router-dom';
import React, {useState, useEffect} from 'react';
import {Tracker} from 'meteor/tracker';
import {withTracker} from 'meteor/react-meteor-data';

import shallowEqual from './shallowCompare';

const history = createBrowserHistory();

class DependencyMemoize {
  constructor() {
    this._instances = {};
    this._memoizedData = {};
    this._idCount = 0;
  }

  call(instanceId, deps, reactiveFn) {
    if (instanceId in this._memoizedData && shallowEqual(this._instances[instanceId], deps)) {
      // always update deps to avoid duplicates preventing garbage collection
      this._instances[instanceId] = deps;

      const data = this._memoizedData[instanceId];
      return [data, false];
    }

    const data = reactiveFn();
    this._instances[instanceId] = deps;
    this._memoizedData[instanceId] = data;
    return [data, true]
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

const useTracker = (reactiveFn, deps = []) => {
  // Note : we always run the reactiveFn in Tracker.nonreactive in case
  // we are already inside a Tracker Computation. This can happen if someone calls
  // `ReactDOM.render` inside a Computation. In that case, we want to opt out
  // of the normal behavior of nested Computations, where if the outer one is
  // invalidated or stopped, it stops the inner one too.

  const [instanceId, forceUpdate] = useState(() => {
    // No side-effects are allowed when computing the initial value.
    // To get the initial return value for the 1st render on mount,
    // we run reactiveFn without autorun or subscriptions.
    // Note: maybe when React Suspense is officially available we could
    // throw a Promise instead to skip the 1st render altogether ?
    return memoize.createId();
  });

  useEffect(() => {
    // Set up the reactive computation.
    const computation = Tracker.nonreactive(() =>
      Tracker.autorun(() => {
        const [, isNew] = memoize.call(instanceId, deps, reactiveFn);
        // trigger rerender only if deps have changed (which are shallow compared)
        if (isNew) forceUpdate(instanceId);
      })
    );
    // On effect cleanup, stop the computation.
    return () => {
      computation.stop();
      memoize.clear(instanceId);
    }
  }, deps);

  const [data] = Tracker.nonreactive(() => memoize.call(instanceId, deps, reactiveFn));

  if (reactiveFn() !== data) {
    console.error(`tracker missmatch, expected ${reactiveFn()} got ${data}`)
  }

  return data;
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
