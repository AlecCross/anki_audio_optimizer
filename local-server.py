import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class LocalHTTPServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Clean up console logs, printing request status in a readable format
        sys.stdout.write("[Server Request] %s\n" % (format % args))

def start_server():
    os.chdir(DIRECTORY)
    
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(("", PORT), LocalHTTPServer) as httpd:
            print("============================================================")
            print("   Anki Audio Optimizer - Local Offline Server")
            print("============================================================")
            print(f" Directory:  {DIRECTORY}")
            print(f" URL:        http://localhost:{PORT}/")
            print("============================================================")
            print(" * Keep this terminal window open while using the app.")
            print(" * To install as a PWA app, click the 'Install' button in ")
            print("   the header, or use the browser's install option.")
            print(" * Press Ctrl+C in this terminal to shut down.")
            print("============================================================")
            
            # Auto-open browser
            try:
                webbrowser.open(f"http://localhost:{PORT}/")
            except Exception as e:
                print(f" Failed to auto-open browser: {e}")
                
            httpd.serve_forever()
    except PermissionError:
        print(f"Error: Permission denied on port {PORT}. Run as admin or change PORT.")
    except OSError as e:
        print(f"Error starting server on port {PORT}: {e}")
        print("The port may already be in use. Close other server processes.")
    except KeyboardInterrupt:
        print("\nServer shutting down. Goodbye!")
        sys.exit(0)

if __name__ == "__main__":
    start_server()
