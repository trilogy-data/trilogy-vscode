
import ReactDOM from "react-dom/client";
import React, { Component, createRef, FormEvent } from 'react'
import { ColumnDescription } from './common'
// import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
// import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';


// SyntaxHighlighter.registerLanguage('sql', sql);


const ITEMS_PER_PAGE = 20;
interface QueryResultsState {
	headers: ColumnDescription[];
	data: any[];
	currentPage: number;
}

class QueryResults extends Component<{ headers: ColumnDescription[]; data: any[] }> {
	constructor(props: {
		headers: ColumnDescription[];
		data: any[];
	}) {
		super(props);
		this.state = {
			currentPage: 1,
		};
	}


	render() {
		const { headers, data } = this.props;
		return (
			<>
				<main>
					<table className="table-auto">
						<thead>
							<tr>
								{headers.map((field: ColumnDescription, index: number) => (
									<th key={index}>{field.column_name}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{data.map((rowData: any, index: number) => (
								<tr key={index}>
									{headers.map((field: ColumnDescription, idx: number) => (
										<td key={idx}>{rowData[field.column_name as keyof typeof rowData]}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>

				</main>
			</>)
	}
}

// @ts-ignore
function SubmitButton({ vscode }) {
	function handleSubmit(e: FormEvent<HTMLButtonElement>) {
		e.preventDefault();
		const input = (document.getElementById('inputText') as HTMLInputElement).value;
		vscode.postMessage({
			command: 'submit',
			text: input,
		});
	}

	return (
		<button type="submit" onClick={handleSubmit}>
			Submit
		</button>
	);
}


class QueryWrapper extends Component<{vscode:any}, QueryResultsState> {
	constructor(props: {vscode:any}) {
		super(props);
		this.state = {
			headers: [],
			data: [],
			currentPage: 1,
		};
	}

	handleNextPage = (): void => {
		this.setState((prevState) => ({
			currentPage: prevState.currentPage + 1,
		}));
	};

	handlePrevPage = (): void => {
		this.setState((prevState) => ({
			currentPage: prevState.currentPage - 1,
		}));
	};
	render() {
		// @ts-ignore
		const { vscode } = this.props;
		const { currentPage, headers, data } = this.state;
		const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
		const endIndex = startIndex + ITEMS_PER_PAGE;
		const currentData = data.slice(startIndex, endIndex);
		return (
			<div className="w-full min-h-screen  flex flex-col items-center">
				<div className="w-full max-w-4xl p-6  shadow-md rounded-lg">
					<input nonce="${nonce}" type="text" id="inputText"
						className="w-full p-2 border bg-gray border-gray-300 rounded-md mb-4"
					/>
					<form className="flex flex-col items-start mb-4">
						<SubmitButton vscode={vscode}

						/>
					</form>
					<h2 className="text-l font-semibold mb-2 text-white-700">Response ({data.length} rows)</h2>
					<QueryResults data={currentData} headers={headers} />
				</div>

				<div className="flex justify-between items-center mt-6">
					<button
						onClick={this.handlePrevPage}
						disabled={currentPage === 1}
						className="px-4 py-2  text-white-500 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition"

					>
						Previous
					</button>
					<span className="text-white-500 py-4">Page {currentPage}</span>
					<button
						onClick={this.handleNextPage}
						disabled={endIndex >= data.length}
						className="px-4 py-2 ttext-white-500 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition"

					>
						Next
					</button>
				</div>
			</div>
		)
	}
}

const queryWrapperRef = createRef<QueryWrapper>();

(function () {
	const root = ReactDOM.createRoot(document.getElementById("root")!);
	// @ts-ignore
	const vscode = acquireVsCodeApi();
	// @ts-ignore
	root.render(<QueryWrapper ref={queryWrapperRef} vscode={vscode} />);

	// Get a reference to the VS Code webview api.
	// We use this API to post messages back to our extension.

	function initialize() { }

	window.addEventListener('message', event => {
		const message = event.data;
		console.log('Received', message);
		switch (message.type) {
			case "initialize":
				initialize();
				return;
			case 'query':
				if (queryWrapperRef.current) {
					queryWrapperRef.current.setState({ data: message.results, headers: message.headers });
				}
				break;
		}
	});
})();