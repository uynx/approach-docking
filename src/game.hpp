#pragma once
#include "physics.hpp"
#include "combat.hpp"
#include <boost/json.hpp>
#include <array>
#include <functional>
#include <map>
#include <string>

class Game {
public:
    using Send=std::function<void(int,const boost::json::value&)>;
    explicit Game(Send send):send_(std::move(send)) {}
    void receive(int peer, const std::string& text);
    void disconnect(int peer);
    void tick();
private:
    struct Pilot {
        int peer=-1;
        std::string name, token;
        flight::State state=flight::initial();
        flight::Controls controls;
        bool ready=false;
        long sequence=-1;
        unsigned long last_input=0;
        bool fire=false;
        int power=-1;
        flight::Vec aim;
    };
    struct Room {
        std::array<Pilot,2> pilots;
        flight::Station station;
        bool combat=false;
        combat::Round battle;
        std::string phase="lobby";
        unsigned long start=0, touched=0;
    };
    Send send_;
    std::map<std::string,Room> rooms_;
    std::map<int,std::string> joined_;
    unsigned long tick_=0;
    void broadcast(const std::string&, const Room&);
    void error(int,const std::string&);
};
