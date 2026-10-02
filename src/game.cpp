#include "game.hpp"
#include <algorithm>
#include <cmath>
#include <random>

namespace json=boost::json;
namespace {
std::string random_text(int length,const std::string& alphabet) {
    std::random_device random;
    std::string result;
    for(int i=0;i<length;++i) result+=alphabet[random()%alphabet.size()];
    return result;
}
std::string string_field(const json::object& obj,const char* key) {
    auto value=obj.if_contains(key);
    return value && value->is_string() ? std::string(value->as_string()) : "";
}
std::string pilot_name(const json::object& obj) {
    auto name=string_field(obj,"name");
    if(name.empty() || name.size()>20) return "";
    for(unsigned char ch:name) if(ch<32 || ch>126) return "";
    return name;
}
json::array state_array(const flight::State& s) {
    return {s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,
        s.attitude.w,s.attitude.x,s.attitude.y,s.attitude.z,s.omega.x,s.omega.y,s.omega.z,
        s.fuel,s.elapsed,s.status,s.score};
}
}
void Game::error(int peer,const std::string& message) {
    send_(peer,json::object{{"type","error"},{"message",message}});
}
void Game::broadcast(const std::string& code,const Room& room) {
    json::array pilots;
    for(const auto& p:room.pilots) pilots.push_back(json::object{{"name",p.name},
        {"connected",p.peer>=0},{"ready",p.ready},{"seq",p.sequence},
        {"state",state_array(p.state)},{"alignment",flight::alignment(p.state)},
        {"spin",flight::relative_spin(p.state)}});
    const json::object message{{"type","state"},{"room",code},{"phase",room.phase},
        {"tick",tick_},{"countdown",room.start>tick_ ? (room.start-tick_)/120.0 : 0},
        {"pilots",pilots}};
    for(const auto& p:room.pilots) if(p.peer>=0) send_(p.peer,message);
}
void Game::receive(int peer,const std::string& text) {
    if(text.size()>1024) { error(peer,"Message too large."); return; }
    boost::system::error_code ec;
    const auto value=json::parse(text,ec);
    if(ec || !value.is_object()) { error(peer,"Invalid message."); return; }
    const auto& obj=value.as_object();
    const auto type=string_field(obj,"type");
    if(type=="ping") { send_(peer,json::object{{"type","pong"}}); return; }
    if(type=="create" || type=="join" || type=="resume") {
        if(joined_.count(peer)) { error(peer,"Leave the current room first."); return; }
        std::string code=string_field(obj,"room");
        const auto name=pilot_name(obj);
        if(type!="resume" && name.empty()) { error(peer,"Use a callsign of 1 to 20 printable characters."); return; }
        if(type=="create") {
            if(rooms_.size()>=32) { error(peer,"All rooms are occupied. Try again later."); return; }
            do {code=random_text(6,"ABCDEFGHJKLMNPQRSTUVWXYZ23456789");} while(rooms_.count(code));
            rooms_.emplace(code,Room{});
        }
        auto it=rooms_.find(code);
        if(it==rooms_.end()) { error(peer,"Room expired or not found."); return; }
        auto& room=it->second;
        int slot=-1;
        for(int i=0;i<2;++i) {
            auto& p=room.pilots[i];
            if(type=="resume") {
                if(!p.token.empty() && p.token==string_field(obj,"token") && p.peer<0) slot=i;
            } else if(room.phase=="lobby" && p.name.empty()) { slot=i; break; }
        }
        if(slot<0) { error(peer,type=="resume" ? "Pilot session unavailable." : "Room is full or already flying."); return; }
        auto& p=room.pilots[slot];
        if(type!="resume") { p.name=name; p.token=random_text(32,"0123456789abcdef"); }
        p.peer=peer;
        room.touched=tick_;
        joined_[peer]=code;
        send_(peer,json::object{{"type","joined"},{"room",code},{"slot",slot},{"token",p.token},{"seq",p.sequence}});
        broadcast(code,room);
        return;
    }
    const auto joined=joined_.find(peer);
    if(joined==joined_.end()) { error(peer,"Join a room first."); return; }
    auto& room=rooms_.at(joined->second);
    auto p=std::find_if(room.pilots.begin(),room.pilots.end(),[&](const Pilot& pilot){return pilot.peer==peer;});
    if(p==room.pilots.end()) return;
    room.touched=tick_;
    if(type=="leave") { disconnect(peer); return; }
    if(type=="ready") {
        if(room.phase=="finished") {
            room.phase="lobby";
            for(auto& pilot:room.pilots) { pilot.ready=false; pilot.state=flight::initial(); pilot.controls={}; }
        }
        if(room.phase!="lobby") { error(peer,"The round has already started."); return; }
        p->ready=true;
        if(room.pilots[0].ready && room.pilots[1].ready && room.pilots[0].peer>=0 && room.pilots[1].peer>=0) {
            room.phase="countdown"; room.start=tick_+360;
        }
        broadcast(joined->second,room);
        return;
    }
    if(type=="input") {
        if(room.phase!="flight" || p->state.status) { error(peer,"Flight controls are not active."); return; }
        auto sequence=obj.if_contains("seq"), axes=obj.if_contains("axes");
        if(!sequence || !sequence->is_int64() || sequence->as_int64()<0 || sequence->as_int64()>9007199254740991LL
            || sequence->as_int64()<=p->sequence || !axes || !axes->is_array() || axes->as_array().size()!=6) {
            error(peer,"Invalid or repeated control sequence."); return;
        }
        flight::Controls controls;
        for(int i=0;i<6;++i) {
            const auto& axis=axes->as_array()[i];
            if(!axis.is_number()) {error(peer,"Invalid thrust.");return;}
            const double v=axis.to_number<double>();
            if(!std::isfinite(v) || v < -1 || v > 1) {error(peer,"Thrust must be between -1 and 1.");return;}
            controls.axis[i]=v;
        }
        p->sequence=sequence->as_int64(); p->controls=controls; p->last_input=tick_;
        return;
    }
    error(peer,"Unknown command.");
}
void Game::disconnect(int peer) {
    auto joined=joined_.find(peer);
    if(joined==joined_.end()) return;
    const auto code=joined->second;
    auto& room=rooms_.at(code);
    for(auto& p:room.pilots) if(p.peer==peer) {p.peer=-1;p.controls={};p.ready=false;}
    if(room.phase=="countdown") {
        room.phase="lobby";
        for(auto& p:room.pilots) p.ready=false;
    }
    room.touched=tick_;
    joined_.erase(joined);
    broadcast(code,room);
}
void Game::tick() {
    ++tick_;
    for(auto it=rooms_.begin();it!=rooms_.end();) {
        auto& room=it->second;
        if(room.pilots[0].peer<0 && room.pilots[1].peer<0 && tick_-room.touched>7200) {
            it=rooms_.erase(it); continue;
        }
        if(room.phase=="countdown" && tick_>=room.start) room.phase="flight";
        if(room.phase=="flight") {
            for(auto& p:room.pilots) {
                if(tick_-p.last_input>60) p.controls={};
                flight::advance(p.state,p.controls,flight::step_seconds);
                flight::judge(p.state);
            }
            if(room.pilots[0].state.status && room.pilots[1].state.status) {
                room.phase="finished";
                for(auto& p:room.pilots) {p.ready=false;p.controls={};}
            }
        }
        if(tick_%6==0) broadcast(it->first,room);
        ++it;
    }
}
