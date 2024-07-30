"""Main entry point for starting the server"""

import argparse
import logging

from trilogy_language_server.server import trilogy_server

logging.basicConfig( level=logging.DEBUG, filemode="w")


def main():
    parser = argparse.ArgumentParser(description="Trilogy Language Server. Defaults over stdio.", prog="trilogy_language_server")

    parser.add_argument(
        "--tcp", action="store_true",
        help="Use TCP server instead of stdio"
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="Bind to this address"
    )
    parser.add_argument(
        "--port", type=int, default=2087,
        help="Bind to this port"
    )
    args = parser.parse_args()

    if args.tcp:
        trilogy_server.start_tcp(args.host, args.port)
    else:
        trilogy_server.start_io()


if __name__ == '__main__':
    main()