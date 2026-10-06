#include "game.hpp"
#include <boost/asio.hpp>
#include <boost/beast.hpp>
#include <deque>
#include <filesystem>
#include <iostream>
#include <memory>
#include <fstream>
#include <csignal>

namespace asio=boost::asio;
namespace beast=boost::beast;
namespace http=beast::http;
namespace websocket=beast::websocket;
using tcp=asio::ip::tcp;
using Clock=std::chrono::steady_clock;
class Session;
struct Server {
    asio::io_context io;
    std::map<int,std::shared_ptr<Session>> peers;
    Game game;
    std::string web;
    int next_peer=0;
    Server(std::string path);
};
class Session:public std::enable_shared_from_this<Session> {
    Server& server;
    int id;
    websocket::stream<beast::tcp_stream> ws;
    beast::flat_buffer buffer;
    http::request_parser<http::string_body> parser;
    std::deque<std::string> outgoing;
    Clock::time_point budget_start=Clock::now();
    unsigned messages=0;
    bool closed=false;
public:
    Session(Server& s,int n,tcp::socket socket):server(s),id(n),ws(std::move(socket)) {}
    void start() {
        parser.header_limit(8192); parser.body_limit(0);
        beast::get_lowest_layer(ws).expires_after(std::chrono::seconds(10));
        http::async_read(ws.next_layer(),buffer,parser,[self=shared_from_this()](auto ec,auto){
            if(ec) return self->close();
            self->request();
        });
    }
    void request() {
        auto request=parser.release();
        std::string path(request.target());
        path=path.substr(0,path.find('?'));
        if(path=="/ws" && websocket::is_upgrade(request)) {
            auto origin=request[http::field::origin];
            const std::string host(request[http::field::host]);
            if(!origin.empty() && origin!="https://"+host && origin!="http://"+host) return close();
            beast::get_lowest_layer(ws).expires_never();
            ws.set_option(websocket::stream_base::timeout::suggested(beast::role_type::server));
            ws.read_message_max(1024);
            ws.async_accept(request,[self=shared_from_this()](auto ec){
                if(ec) return self->close();
                self->read();
            });
            return;
        }
        auto response=std::make_shared<http::response<http::string_body>>(http::status::ok,11);
        response->set(http::field::server,"Approach");
        response->set(http::field::cache_control,"no-cache");
        response->set("X-Content-Type-Options","nosniff");
        response->set("Content-Security-Policy","default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
        response->keep_alive(false);
        const std::map<std::string,std::string> files={{"/","text/html; charset=utf-8"},
            {"/app.js","text/javascript"},{"/scene.js","text/javascript"},{"/style.css","text/css"},
            {"/flight-view.js","text/javascript"},{"/damage.js","text/javascript"},
            {"/state.js","text/javascript"},{"/damage-effects.js","text/javascript"},{"/models.js","text/javascript"},{"/assets/earth.jpg","image/jpeg"},{"/assets/stars.jpg","image/jpeg"},{"/assets/moon.jpg","image/jpeg"},
            {"/physics.wasm","application/wasm"},{"/vendor/three.module.js","text/javascript"},
            {"/vendor/three.core.js","text/javascript"}};
        if(request.method()!=http::verb::get) {
            response->result(http::status::method_not_allowed); response->body()="GET required";
        } else if(path=="/health") {
            response->set(http::field::content_type,"application/json"); response->body()="{\"status\":\"ok\"}";
        } else if(files.count(path)) {
            std::ifstream file(server.web+(path=="/" ? "/index.html" : path),std::ios::binary);
            if(file) {
                response->set(http::field::content_type,files.at(path));
                response->body()=std::string(std::istreambuf_iterator<char>(file),{});
            } else {response->result(http::status::not_found);response->body()="Not found";}
        } else {response->result(http::status::not_found);response->body()="Not found";}
        response->prepare_payload();
        http::async_write(ws.next_layer(),*response,[self=shared_from_this(),response](auto,auto){self->close();});
    }
    void read() {
        ws.async_read(buffer,[self=shared_from_this()](auto ec,auto){
            if(ec) return self->close();
            if(Clock::now()-self->budget_start>std::chrono::seconds(1)) {
                self->budget_start=Clock::now();self->messages=0;
            }
            if(++self->messages>100 || !self->ws.got_text()) return self->close();
            self->server.game.receive(self->id,beast::buffers_to_string(self->buffer.data()));
            self->buffer.consume(self->buffer.size());
            self->read();
        });
    }
    void send(const boost::json::value& message) {
        if(closed) return;
        if(outgoing.size()>8) {
            asio::post(server.io,[self=shared_from_this()]{self->close();}); return;
        }
        outgoing.push_back(boost::json::serialize(message));
        if(outgoing.size()==1) write();
    }
    void write() {
        ws.text(true);
        ws.async_write(asio::buffer(outgoing.front()),[self=shared_from_this()](auto ec,auto){
            if(ec) return self->close();
            self->outgoing.pop_front();
            if(!self->outgoing.empty()) self->write();
        });
    }
    void close() {
        if(closed) return;
        closed=true;
        beast::error_code ec;
        beast::get_lowest_layer(ws).socket().close(ec);
        server.game.disconnect(id);
        server.peers.erase(id);
    }
};
Server::Server(std::string path):game([this](int id,const auto& message){
    auto it=peers.find(id); if(it!=peers.end()) it->second->send(message);
}),web(std::move(path)) {}
int main(int argc,char** argv) {
    try {
        int port=std::getenv("PORT") ? std::stoi(std::getenv("PORT")) : 8080;
        std::string web="build/web";
        for(int i=1;i<argc;++i) {
            const std::string arg=argv[i];
            if(arg=="--port" && i+1<argc) port=std::stoi(argv[++i]);
            else if(arg=="--web" && i+1<argc) web=argv[++i];
            else throw std::runtime_error("Usage: approach [--port PORT] [--web DIRECTORY]");
        }
        if(port<1 || port>65535) throw std::runtime_error("Invalid port");
        Server server(web);
        tcp::acceptor acceptor(server.io,{tcp::v4(),static_cast<unsigned short>(port)});
        std::function<void()> accept;
        accept=[&]{acceptor.async_accept([&](auto ec,tcp::socket socket){
            if(!ec && server.peers.size()<96) {
                int id=++server.next_peer;
                auto session=std::make_shared<Session>(server,id,std::move(socket));
                server.peers.emplace(id,session);session->start();
            }
            if(acceptor.is_open()) accept();
        });};
        asio::steady_timer timer(server.io);
        auto next=Clock::now();
        std::function<void()> tick;
        tick=[&]{
            server.game.tick();
            next+=std::chrono::nanoseconds(8333333);
            if(Clock::now()-next>std::chrono::milliseconds(250)) next=Clock::now();
            timer.expires_at(next);
            timer.async_wait([&](auto ec){if(!ec) tick();});
        };
        asio::signal_set signals(server.io,SIGINT,SIGTERM);
        signals.async_wait([&](auto,int){server.io.stop();});
        accept();tick();
        std::cout << "Approach listening on http://localhost:" << port << std::endl;
        server.io.run();
    } catch(const std::exception& error) {
        std::cerr << error.what() << '\n'; return 1;
    }
}
