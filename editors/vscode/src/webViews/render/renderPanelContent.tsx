
import ReactDOM from "react-dom/client";
import React, { Component, createRef, FormEvent } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import { tomorrowNight } from 'react-syntax-highlighter/dist/esm/styles/hljs';


SyntaxHighlighter.registerLanguage('sql', sql);


interface QueryResultsState {
	renderQueries: string[],
	dialect: string
}


class RenderWrapper extends Component<{ vscode: any }, QueryResultsState> {
	constructor(props: { vscode: any }) {
		super(props);
		this.state = {
			renderQueries: [],
			dialect: 'DuckDb'
		};
	}


	render() {
		const { renderQueries } = this.state;
		return (
			<div className="w-full min-h-screen flex flex-col items-center ">
				All Queries
				{renderQueries.map((sql, index) => (
					<div key={index} className="w-full max-w-4xl p-6 shadow-md rounded-lg mb-4">
						<h2 className="text-l font-semibold mb-2 text-white-700 ">SQL</h2>
						<SyntaxHighlighter className="bg-transparent" language="sql" style={tomorrowNight}>
							{sql}
						</SyntaxHighlighter>
					</div>
				))}
			</div>
		);
	}
}

const queryWrapperRef = createRef<RenderWrapper>();

(function () {
	const root = ReactDOM.createRoot(document.getElementById("root")!);
	// @ts-expect-error vscode is not defined
	const vscode = acquireVsCodeApi();

	root.render(<RenderWrapper ref={queryWrapperRef} vscode={vscode} />);

	// Get a reference to the VS Code webview api.
	// We use this API to post messages back to our extension.

	function initialize() { }

	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.type) {
			case "initialize":
				initialize();
				return;
			case 'render-queries':
				if (queryWrapperRef.current) {
					queryWrapperRef.current.setState({ renderQueries: message.renderQueries, dialect: message.dialect });
				}
				return;
		}
	});
})();